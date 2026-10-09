use crate::AppStateSync;
use std::sync::{mpsc, Arc, Barrier};
use std::thread;
use std::time::SystemTime;
use vibe_cast_models::{DeviceType, FolderPlaybackQueue, MessageConfig, PlaybackCommand};

fn folder_start(state: &AppStateSync, next_id: &str) -> vibe_cast_models::PlaybackControlState {
    let message = state.messages.lock().unwrap()[0].clone();
    let queue = FolderPlaybackQueue {
        folder_id: "folder".to_owned(),
        message_ids: vec![message.id.clone(), next_id.to_owned()],
        current_index: 0,
    };
    state.start_folder_playback(message, queue, DeviceType::MobileRemote)
}

fn assert_snapshots(
    state: &AppStateSync,
    revision: u64,
    message_id: Option<&str>,
    session_id: Option<&str>,
    is_playing: bool,
    queue_index: Option<usize>,
) {
    let desktop = state.get_state();
    let remote = state.get_remote_state();
    let e2e = state.get_e2e_state_snapshot(None);
    for snapshot in [&desktop.playback_control, &remote.playback_control] {
        assert_eq!(snapshot.is_playing, is_playing);
        assert_eq!(snapshot.session_id.as_deref(), session_id);
        assert_eq!(
            snapshot
                .current_message
                .as_ref()
                .map(|message| message.id.as_str()),
            message_id
        );
    }
    assert_eq!(desktop.runtime_revision, revision);
    assert_eq!(remote.runtime_revision, revision);
    assert_eq!(e2e.runtime_revision, revision);
    assert_eq!(
        desktop
            .triggered_message
            .as_ref()
            .map(|message| message.id.as_str()),
        message_id
    );
    assert_eq!(
        remote
            .triggered_message
            .as_ref()
            .map(|message| message.id.as_str()),
        message_id
    );
    assert_eq!(e2e.triggered_message_id.as_deref(), message_id);
    assert_eq!(e2e.playback_current_message_id.as_deref(), message_id);
    assert_eq!(e2e.playback_session_id.as_deref(), session_id);
    assert_eq!(e2e.playback_is_playing, is_playing);
    assert_eq!(
        desktop
            .folder_playback_queue
            .as_ref()
            .map(|queue| queue.current_index),
        queue_index
    );
    assert_eq!(
        remote
            .folder_playback_queue
            .as_ref()
            .map(|queue| queue.current_index),
        queue_index
    );
    assert_eq!(e2e.queue_current_index, queue_index);
    if let Some(queue) = desktop.folder_playback_queue {
        assert_eq!(
            queue
                .message_ids
                .get(queue.current_index)
                .map(String::as_str),
            message_id
        );
        assert_eq!(e2e.queue_current_message_id.as_deref(), message_id);
    }
}

#[test]
fn playback_transitions_keep_all_public_snapshots_and_revisions_consistent() {
    let state = AppStateSync::new();
    let first = folder_start(&state, "msg-2");
    let first_session = first.session_id.as_deref().unwrap();
    assert_snapshots(&state, 1, Some("msg-1"), Some(first_session), true, Some(0));

    state
        .process_playback_command(PlaybackCommand::Pause {
            device_id: "control_plane".to_owned(),
            timestamp: SystemTime::now(),
        })
        .unwrap();
    assert!(state
        .finish_message_playback("msg-1", first_session, DeviceType::System)
        .is_none());
    assert_snapshots(
        &state,
        2,
        Some("msg-1"),
        Some(first_session),
        false,
        Some(0),
    );
    state.messages.lock().unwrap()[0].text = "Edited while paused".to_owned();
    state
        .process_playback_command(PlaybackCommand::Resume {
            device_id: "control_plane".to_owned(),
            timestamp: SystemTime::now(),
        })
        .unwrap();
    assert_snapshots(&state, 3, Some("msg-1"), Some(first_session), true, Some(0));
    assert_eq!(
        state.get_state().triggered_message.unwrap().text,
        "Edited while paused"
    );
    assert_eq!(
        state.get_remote_state().triggered_message.unwrap().text,
        "Edited while paused"
    );

    let advanced = state
        .finish_message_playback("msg-1", first_session, DeviceType::MobileRemote)
        .unwrap();
    let second_session = advanced.control.session_id.as_deref().unwrap();
    assert_ne!(first_session, second_session);
    assert_eq!(advanced.control.initiated_by, DeviceType::System);
    assert_eq!(advanced.next_message.unwrap().id, "msg-2");
    assert!(advanced.missing_next_message_id.is_none());
    assert_snapshots(
        &state,
        4,
        Some("msg-2"),
        Some(second_session),
        true,
        Some(1),
    );
    assert!(state
        .finish_message_playback("msg-1", first_session, DeviceType::System)
        .is_none());
    assert!(state
        .finish_message_playback("msg-1", second_session, DeviceType::System)
        .is_none());
    assert_snapshots(
        &state,
        4,
        Some("msg-2"),
        Some(second_session),
        true,
        Some(1),
    );

    let stopped = state
        .finish_message_playback("msg-2", second_session, DeviceType::MobileRemote)
        .unwrap();
    assert_eq!(stopped.control.initiated_by, DeviceType::MobileRemote);
    assert!(stopped.next_message.is_none());
    assert_snapshots(&state, 5, None, None, false, None);

    let standalone = state
        .start_message_playback("msg-1", DeviceType::ControlPlane)
        .unwrap();
    assert_snapshots(
        &state,
        6,
        Some("msg-1"),
        standalone.session_id.as_deref(),
        true,
        None,
    );
    folder_start(&state, "msg-2");
    let message = state.messages.lock().unwrap()[0].clone();
    let replay = state.start_message_playback_with_message(message, DeviceType::ControlPlane);
    assert_snapshots(
        &state,
        8,
        Some("msg-1"),
        replay.session_id.as_deref(),
        true,
        None,
    );
    state.stop_message_playback(DeviceType::ControlPlane);
    assert_snapshots(&state, 9, None, None, false, None);

    let command_start = state
        .process_playback_command(PlaybackCommand::Start {
            message_id: "msg-1".to_owned(),
            device_id: "control_plane".to_owned(),
            timestamp: SystemTime::now(),
        })
        .unwrap();
    assert_snapshots(
        &state,
        10,
        Some("msg-1"),
        command_start.session_id.as_deref(),
        true,
        None,
    );
    state
        .process_playback_command(PlaybackCommand::Stop {
            device_id: "control_plane".to_owned(),
            timestamp: SystemTime::now(),
        })
        .unwrap();
    assert_snapshots(&state, 11, None, None, false, None);
}

#[test]
fn missing_next_message_stops_and_clears_queue_once() {
    let state = AppStateSync::new();
    let started = folder_start(&state, "deleted-message");
    let session_id = started.session_id.as_deref().unwrap();
    let completion = state
        .finish_message_playback("msg-1", session_id, DeviceType::System)
        .unwrap();
    assert_eq!(
        completion.missing_next_message_id.as_deref(),
        Some("deleted-message")
    );
    assert!(completion.next_message.is_none());
    assert_snapshots(&state, 2, None, None, false, None);
    assert!(state
        .finish_message_playback("msg-1", session_id, DeviceType::System)
        .is_none());
    assert_snapshots(&state, 2, None, None, false, None);
}

#[test]
fn completion_owns_validation_through_commit_when_a_replay_competes() {
    let state = Arc::new(AppStateSync::new());
    let first = folder_start(&state, "msg-2");
    let session_id = first.session_id.unwrap();
    let replacement: MessageConfig = state.messages.lock().unwrap()[0].clone();
    let (validated_tx, validated_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let completing_state = Arc::clone(&state);
    let completion = thread::spawn(move || {
        completing_state
            .finish_message_playback_inner("msg-1", &session_id, DeviceType::System, || {
                validated_tx.send(()).unwrap();
                release_rx.recv().unwrap();
            })
            .unwrap()
    });
    validated_rx.recv().unwrap();
    // Validation outside the owner would leave this lock available and allow
    // the replay to commit before the old completion advances or stops it.
    assert!(state.playback.try_lock().is_err());
    let (attempting_tx, attempting_rx) = mpsc::channel();
    let (committed_tx, committed_rx) = mpsc::channel();
    let replay_state = Arc::clone(&state);
    let replay = thread::spawn(move || {
        attempting_tx.send(()).unwrap();
        let control =
            replay_state.start_message_playback_with_message(replacement, DeviceType::ControlPlane);
        committed_tx.send(control).unwrap();
    });
    attempting_rx.recv().unwrap();
    assert!(matches!(
        committed_rx.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    release_tx.send(()).unwrap();
    let completed = completion.join().unwrap();
    let replacement = committed_rx.recv().unwrap();
    replay.join().unwrap();
    assert_eq!(completed.next_message.unwrap().id, "msg-2");
    assert_ne!(completed.control.session_id, replacement.session_id);
    assert_snapshots(
        &state,
        3,
        Some("msg-1"),
        replacement.session_id.as_deref(),
        true,
        None,
    );
}

#[test]
fn competing_duplicate_completions_advance_exactly_once() {
    let state = Arc::new(AppStateSync::new());
    let first = folder_start(&state, "msg-2");
    let session_id = first.session_id.unwrap();
    let barrier = Arc::new(Barrier::new(3));
    let contenders: Vec<_> = (0..2)
        .map(|_| {
            let state = Arc::clone(&state);
            let barrier = Arc::clone(&barrier);
            let session_id = session_id.clone();
            thread::spawn(move || {
                barrier.wait();
                state.finish_message_playback("msg-1", &session_id, DeviceType::System)
            })
        })
        .collect();
    barrier.wait();
    let results: Vec<_> = contenders
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|result| result.is_some()).count(), 1);
    let completion = results.into_iter().flatten().next().unwrap();
    assert_snapshots(
        &state,
        2,
        Some("msg-2"),
        completion.control.session_id.as_deref(),
        true,
        Some(1),
    );
}
