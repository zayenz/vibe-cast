use tauri_app_lib::AppStateSync;

#[test]
fn load_config_with_messages_and_tree() {
    // Sample config with messages and nested messageTree
    let config_json = r#"
    {
      "version": 1,
      "activeVisualization": "fireplace",
      "enabledVisualizations": ["fireplace", "techno"],
      "commonSettings": { "intensity": 1, "dim": 1 },
      "visualizationSettings": {},
      "visualizationPresets": [],
      "messages": [
        { "id": "a", "text": "One", "textStyle": "scrolling-capitals" },
        { "id": "b", "text": "Two", "textStyle": "scrolling-capitals" },
        { "id": "c", "text": "Three", "textStyle": "scrolling-capitals" }
      ],
      "messageTree": [
        {
          "type": "folder",
          "id": "folder-1",
          "name": "Folder",
          "collapsed": false,
          "children": [
            { "type": "message", "id": "a", "message": { "id": "a", "text": "One", "textStyle": "scrolling-capitals" } },
            { "type": "message", "id": "b", "message": { "id": "b", "text": "Two", "textStyle": "scrolling-capitals" } },
            { "type": "message", "id": "c", "message": { "id": "c", "text": "Three", "textStyle": "scrolling-capitals" } }
          ]
        }
      ],
      "defaultTextStyle": "scrolling-capitals",
      "textStyleSettings": {},
      "textStylePresets": [],
      "messageStats": {}
    }
    "#;

    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("config.json");
    std::fs::write(&path, config_json).expect("write config");

    let state = AppStateSync::new();
    state
        .load_config_from_file(path.to_str().unwrap())
        .expect("load config");

    let messages = state.messages.lock().unwrap();
    assert_eq!(messages.len(), 3, "messages should be loaded");

    let tree = state.message_tree.lock().unwrap();
    let tree_arr = tree.as_array().expect("tree should be array");
    assert_eq!(tree_arr.len(), 1, "tree root node count");
}

