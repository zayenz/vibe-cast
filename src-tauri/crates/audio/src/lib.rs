use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample};
use realfft::RealFftPlanner;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};

const FFT_SIZE: usize = 1024;

pub struct AudioState {
    pub fft_data: Arc<Mutex<Vec<f32>>>,
}

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("Failed to enumerate audio inputs: {0}")]
    Devices(#[from] cpal::DevicesError),
    #[error("No audio input device found")]
    NoInputDevice,
    #[error("Failed to get default audio input configuration: {0}")]
    DefaultConfig(#[from] cpal::DefaultStreamConfigError),
    #[error("Audio input configuration has no channels")]
    NoChannels,
    #[error("Unsupported audio sample format: {0}")]
    UnsupportedFormat(SampleFormat),
    #[error("Failed to build audio input stream: {0}")]
    BuildStream(#[from] cpal::BuildStreamError),
    #[error("Failed to start audio input stream: {0}")]
    PlayStream(#[from] cpal::PlayStreamError),
}

pub fn silent_audio_state() -> AudioState {
    AudioState {
        fft_data: Arc::new(Mutex::new(vec![0.0; FFT_SIZE / 2])),
    }
}

/// Start capture and publish FFT magnitudes for the application's lifetime.
///
/// # Errors
/// Returns an error when no usable input device or configuration exists, or the
/// input stream cannot be created or started.
pub fn start_audio_capture(app_handle: AppHandle) -> Result<AudioState, AudioError> {
    let host = cpal::default_host();

    // On macOS, loopback usually requires a virtual device like BlackHole.
    let device = host
        .input_devices()?
        .find(|d| d.name().map(|n| n.contains("BlackHole")).unwrap_or(false))
        .or_else(|| host.default_input_device())
        .ok_or(AudioError::NoInputDevice)?;

    eprintln!("Using audio device: {}", device.name().unwrap_or_default());

    let supported_config = device.default_input_config()?;
    let config = supported_config.config();
    if config.channels == 0 {
        return Err(AudioError::NoChannels);
    }
    let fft_data = Arc::new(Mutex::new(vec![0.0; FFT_SIZE / 2]));
    let latest_frame = Arc::new(Mutex::new(vec![0.0; FFT_SIZE / 2]));
    let has_pending_frame = Arc::new(AtomicBool::new(false));

    macro_rules! build_stream {
        ($sample:ty) => {
            build_capture_stream::<$sample>(
                &device,
                &config,
                Arc::clone(&latest_frame),
                Arc::clone(&has_pending_frame),
            )?
        };
    }
    let stream = match supported_config.sample_format() {
        SampleFormat::I8 => build_stream!(i8),
        SampleFormat::I16 => build_stream!(i16),
        SampleFormat::I32 => build_stream!(i32),
        SampleFormat::I64 => build_stream!(i64),
        SampleFormat::U8 => build_stream!(u8),
        SampleFormat::U16 => build_stream!(u16),
        SampleFormat::U32 => build_stream!(u32),
        SampleFormat::U64 => build_stream!(u64),
        SampleFormat::F32 => build_stream!(f32),
        SampleFormat::F64 => build_stream!(f64),
        format => return Err(AudioError::UnsupportedFormat(format)),
    };
    stream.play()?;

    let fft_data_forwarder = Arc::clone(&fft_data);
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(33));
        if !has_pending_frame.swap(false, Ordering::AcqRel) {
            continue;
        }

        let snapshot = match latest_frame.lock() {
            Ok(frame) => frame.clone(),
            Err(_) => continue,
        };

        if let Ok(mut shared) = fft_data_forwarder.lock() {
            shared.clone_from(&snapshot);
        }

        let _ = app_handle.emit("audio-data", snapshot);
    });

    // CPAL streams cannot be stored in Send + Sync Tauri state. Capture starts
    // once, and the operating system releases the stream when the process exits.
    std::mem::forget(stream);

    Ok(AudioState { fft_data })
}

fn build_capture_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    latest_frame: Arc<Mutex<Vec<f32>>>,
    has_pending_frame: Arc<AtomicBool>,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let mut planner = RealFftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    let mut buffer = Vec::with_capacity(FFT_SIZE);
    let mut fft_input = fft.make_input_vec();
    let mut fft_output = fft.make_output_vec();
    let mut fft_scratch = fft.make_scratch_vec();
    let mut magnitudes = vec![0.0_f32; FFT_SIZE / 2];
    let mut mixer = MonoMixer::new(usize::from(config.channels));

    device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            for &sample in data {
                let Some(mono) = mixer.push(sample) else {
                    continue;
                };
                buffer.push(mono);
                if buffer.len() == FFT_SIZE {
                    fft_input.copy_from_slice(&buffer);
                    if fft
                        .process_with_scratch(&mut fft_input, &mut fft_output, &mut fft_scratch)
                        .is_ok()
                    {
                        for (index, value) in fft_output.iter().take(FFT_SIZE / 2).enumerate() {
                            magnitudes[index] = (value.re * value.re + value.im * value.im).sqrt()
                                / (FFT_SIZE as f32).sqrt();
                        }

                        if let Ok(mut latest) = latest_frame.try_lock() {
                            latest.copy_from_slice(&magnitudes);
                            has_pending_frame.store(true, Ordering::Release);
                        }
                    }
                    buffer.clear();
                }
            }
        },
        |err| eprintln!("Audio stream error: {}", err),
        None,
    )
}

// Average each interleaved frame. Partial frames survive callback boundaries.
struct MonoMixer {
    channels: usize,
    count: usize,
    sum: f32,
}

impl MonoMixer {
    fn new(channels: usize) -> Self {
        Self {
            channels,
            count: 0,
            sum: 0.0,
        }
    }

    fn push<T>(&mut self, sample: T) -> Option<f32>
    where
        T: SizedSample,
        f32: FromSample<T>,
    {
        self.sum += sample.to_sample::<f32>();
        self.count += 1;
        if self.count != self.channels {
            return None;
        }
        let mono = self.sum / self.channels as f32;
        self.count = 0;
        self.sum = 0.0;
        Some(mono)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_formats_are_normalized_before_mixing() {
        let mut mono = MonoMixer::new(1);
        assert_eq!(mono.push(i16::MIN), Some(-1.0));
        assert_eq!(mono.push(0_i16), Some(0.0));
        assert!((mono.push(i16::MAX).unwrap() - 1.0).abs() < 0.0001);
        assert_eq!(mono.push(0_u16), Some(-1.0));
        assert_eq!(mono.push(32768_u16), Some(0.0));
        assert!((mono.push(u16::MAX).unwrap() - 1.0).abs() < 0.0001);
        assert_eq!(mono.push(0.25_f32), Some(0.25));
        assert_eq!(mono.push(-0.5_f64), Some(-0.5));
        let mut stereo = MonoMixer::new(2);
        assert_eq!(stereo.push(-0.25_f32), None);
        assert_eq!(stereo.push(0.75_f32), Some(0.25));
    }

    #[test]
    fn stereo_tone_keeps_mono_frequency_across_callback_boundaries() {
        let tone: Vec<f32> = (0..FFT_SIZE)
            .map(|i| (std::f32::consts::TAU * 32.0 * i as f32 / FFT_SIZE as f32).sin())
            .collect();
        let interleaved: Vec<f32> = tone.iter().flat_map(|&sample| [sample, sample]).collect();
        let mut mixer = MonoMixer::new(2);
        let mut mixed = Vec::new();
        for callback in interleaved.chunks(127) {
            for &sample in callback {
                if let Some(mono) = mixer.push(sample) {
                    mixed.push(mono);
                }
            }
        }
        assert_eq!(mixed, tone);
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(FFT_SIZE);
        let mut output = fft.make_output_vec();
        let mut scratch = fft.make_scratch_vec();
        fft.process_with_scratch(&mut mixed, &mut output, &mut scratch)
            .unwrap();
        let peak = output
            .iter()
            .enumerate()
            .max_by(|(_, left), (_, right)| left.norm_sqr().total_cmp(&right.norm_sqr()))
            .unwrap()
            .0;
        assert_eq!(peak, 32);
    }
}
