use crate::AppStateSync;
use vibe_cast_models::{E2EClientKind, E2EProbeEvent};

#[test]
fn e2e_sessions_capture_client_and_server_snapshots() {
    std::env::set_var("VIBECAST_E2E", "1");
    let app_state = AppStateSync::new();

    let session = app_state.start_e2e_session(Some("unit-test".to_string()));
    let server_snapshot = app_state.get_e2e_state_snapshot(None);
    app_state.record_e2e_probe(E2EProbeEvent {
        session_id: session.session_id.clone(),
        client_id: "remote-a".to_string(),
        client_label: "remote-a".to_string(),
        client_kind: E2EClientKind::Remote,
        event_type: "remote_dom_snapshot".to_string(),
        ts: 123,
        payload: serde_json::json!({
            "snapshot": {
                "configRevision": server_snapshot.config_revision,
                "runtimeRevision": server_snapshot.runtime_revision,
                "activeVisualization": server_snapshot.active_visualization,
                "activeVisualizationPreset": server_snapshot.active_visualization_preset,
                "triggeredMessageId": server_snapshot.triggered_message_id,
                "playbackSessionId": server_snapshot.playback_session_id,
                "playbackIsPlaying": server_snapshot.playback_is_playing,
                "playbackCurrentMessageId": server_snapshot.playback_current_message_id,
                "queueFolderId": server_snapshot.queue_folder_id,
                "queueCurrentIndex": server_snapshot.queue_current_index,
                "queueCurrentMessageId": server_snapshot.queue_current_message_id,
                "messageTriggerCounts": server_snapshot.message_trigger_counts,
                "connectionPhase": "live"
            }
        }),
    });

    let summary = app_state
        .get_e2e_session_summary(&session.session_id)
        .expect("summary should exist");
    assert_eq!(summary.scenario_name.as_deref(), Some("unit-test"));
    assert!(summary.server_snapshot.is_some());
    assert!(summary.client_snapshots.contains_key("remote-a"));

    app_state
        .end_e2e_session(&session.session_id, Some("completed".to_string()), None)
        .expect("session should close");
    let ended = app_state
        .get_e2e_session_summary(&session.session_id)
        .expect("summary should still exist");
    assert_eq!(ended.status, "completed");
    assert!(ended.ended_at.is_some());
}
