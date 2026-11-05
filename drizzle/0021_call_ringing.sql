ALTER TABLE `chat_call_signals`
  MODIFY COLUMN `kind` enum('ring','offer','answer','ice-candidate','renegotiate','bye') NOT NULL;
