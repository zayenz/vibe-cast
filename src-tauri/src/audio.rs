use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use realfft::RealFftPlanner;
use std::sync::{Arc, Mutex};
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

    let mut buffer = Vec::with_capacity(fft_size);
    let app_handle_clone = app_handle.clone();
    
    let fft_data = Arc::new(Mutex::new(vec![0.0; fft_size / 2]));
    let fft_data_clone = fft_data.clone();

    let stream = device.build_input_stream(
        &config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            for &sample in data {
                buffer.push(sample);
                if buffer.len() >= fft_size {
                    // Process FFT
                    let mut indata = buffer.clone();
                    let mut outdata = fft.make_output_vec();
                    if let Ok(_) = fft.process(&mut indata, &mut outdata) {
                        // Calculate magnitudes and normalize
                        let magnitudes: Vec<f32> = outdata
                            .iter()
                            .take(fft_size / 2)
                            .map(|c| (c.re * c.re + c.im * c.im).sqrt() / (fft_size as f32).sqrt())
                            .collect();

                        // Update shared state
                        if let Ok(mut shared) = fft_data_clone.lock() {
                            *shared = magnitudes.clone();
                        }

                        // Emit to the frontend
                        let _ = app_handle_clone.emit("audio-data", magnitudes);
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


