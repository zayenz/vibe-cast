use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use realfft::RealFftPlanner;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};

pub struct AudioState {
    pub fft_data: Arc<Mutex<Vec<f32>>>,
}

pub fn start_audio_capture(app_handle: AppHandle) -> AudioState {
    let host = cpal::default_host();
    
    // On macOS, loopback usually requires a virtual device like BlackHole.
    // We'll try to find a device with "BlackHole" in the name, otherwise use default input.
    let device = host
        .input_devices()
        .expect("Failed to get input devices")
        .find(|d| d.name().map(|n| n.contains("BlackHole")).unwrap_or(false))
        .or_else(|| host.default_input_device())
        .expect("No input device found");

    println!("Using audio device: {}", device.name().unwrap_or_default());

    let config: cpal::StreamConfig = device
        .default_input_config()
        .expect("Failed to get default input config")
        .into();

    let _sample_rate = config.sample_rate.0 as usize;
    let fft_size = 1024;
    let mut planner = RealFftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);

    let fft_data = Arc::new(Mutex::new(vec![0.0; fft_size / 2]));
    let fft_data_forwarder = fft_data.clone();
    let latest_frame = Arc::new(Mutex::new(vec![0.0; fft_size / 2]));
    let latest_frame_callback = latest_frame.clone();
    let has_pending_frame = Arc::new(AtomicBool::new(false));
    let has_pending_frame_callback = has_pending_frame.clone();
    let app_handle_forwarder = app_handle.clone();

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

        let _ = app_handle_forwarder.emit("audio-data", snapshot);
    });

    let mut buffer = Vec::with_capacity(fft_size);
    let mut fft_input = vec![0.0_f32; fft_size];
    let mut fft_output = fft.make_output_vec();
    let mut magnitudes = vec![0.0_f32; fft_size / 2];

    let stream = device.build_input_stream(
        &config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            for &sample in data {
                buffer.push(sample);
                if buffer.len() >= fft_size {
                    fft_input.copy_from_slice(&buffer[..fft_size]);
                    if fft.process(&mut fft_input, &mut fft_output).is_ok() {
                        for (index, value) in fft_output.iter().take(fft_size / 2).enumerate() {
                            magnitudes[index] =
                                (value.re * value.re + value.im * value.im).sqrt()
                                    / (fft_size as f32).sqrt();
                        }

                        if let Ok(mut latest) = latest_frame_callback.try_lock() {
                            latest.copy_from_slice(&magnitudes);
                            has_pending_frame_callback.store(true, Ordering::Release);
                        }
                    }
                    buffer.clear();
                }
            }
        },
        |err| eprintln!("Audio stream error: {}", err),
        None,
    ).expect("Failed to build input stream");

    stream.play().expect("Failed to play audio stream");
    
    // Keep the stream alive for the app's lifetime.
    // Note: cpal::Stream is not Send+Sync, so we can't store it in Tauri state.
    // Using mem::forget is the standard workaround for long-running audio streams.
    std::mem::forget(stream);

    AudioState {
        fft_data,
    }
}

