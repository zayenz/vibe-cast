import { invoke } from '@tauri-apps/api/core';
import { MessageConfig } from '../plugins/types';

/**
 * Load message text from file if textFile is specified.
 * Returns the message with text populated from file.
 * Automatically enables splitting by newlines for file-based text.
 */
export async function resolveMessageText(
  message: MessageConfig
): Promise<MessageConfig> {
  if (!message.textFile) {
    return message;
  }
  
  try {
    const text = await invoke<string>('load_message_text_file', {
      filePath: message.textFile
    });
    
    return {
      ...message,
      text,
      // Auto-enable splitting by newlines for file-based text
      splitEnabled: true,
      splitSeparator: '\n'
    };
  } catch (error) {
    console.error(`Failed to load text file '${message.textFile}':`, error);
    return {
      ...message,
      text: `[Error loading file: ${message.textFile}]`
    };
  }
}

