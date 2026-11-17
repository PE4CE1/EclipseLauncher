export function describeCaptureError(error:unknown):string{
  if(error&&typeof error==='object'){
    const detail=error as {name?:string;message?:string}
    if(detail.message)return String(detail.message).slice(0,1800)
    if(detail.name)return detail.name
  }
  return String(error).slice(0,1800)
}
export function nativeFailureNeedsRestart(error:unknown,phase:'snapshot'|'save'):boolean{
  const code=describeCaptureError(error)
  // Restarting cannot fix unavailable storage, a deliberately closed source or
  // a full work queue. A failed snapshot can leave a live but stalled producer.
  if(/ENOSPC|EACCES|EPERM|no space|not enough space|disk (?:is )?full|permission denied|access (?:is )?denied|clip-queue-full|capture-cancelled|capture-page-closed|selected-(?:window|display)-(?:closed|unavailable)|capture-owned-by-another-window/i.test(code))return false
  return phase==='snapshot'||/native-save-failed|native-replay|native-capture-stopped|invalid data found|moov atom|encoded clip failed media validation/i.test(code)
}
export function captureErrorMessage(error:unknown,de:boolean):string{
  const code=describeCaptureError(error)
  if(/ENOSPC|no space|not enough space|disk (?:is )?full/i.test(code))return de?'Nicht genügend Speicherplatz. Gib Platz im Clip-Ordner und auf dem Laufwerk für temporäre Dateien frei.':'Not enough disk space. Free space in the clips folder and on the temporary-files drive.'
  if(/EACCES|EPERM|permission denied|access (?:is )?denied/i.test(code))return de?'Eclipse kann die Clip-Dateien nicht schreiben. Prüfe die Berechtigungen des Clip-Ordners.':'Eclipse cannot write the clip files. Check the clips folder permissions.'
  const messages:[string,string,string][]=[
    ['native-api-unavailable','Bitte Eclipse vollständig beenden und neu starten, um die native Aufnahme zu laden.','Fully quit and restart Eclipse to load native recording.'],
    ['native-helper-missing','Die nativen Aufnahme-Dateien fehlen. Installiere Eclipse erneut.','Native recording files are missing. Reinstall Eclipse.'],
    ['window-capture-unavailable','Die Windows-Aufnahme ist auf diesem System nicht verfügbar. Prüfe Windows und den Grafiktreiber.','Windows capture is unavailable on this system. Check Windows and your graphics driver.'],
    ['selected-window-unavailable','Öffne das gewählte Fenster und wähle es bei Bedarf erneut aus.','Open the selected window and select it again if necessary.'],
    ['selected-window-closed','Das Aufnahmefenster wurde geschlossen. Wähle eine neue Quelle.','The recording window was closed. Choose a new source.'],
    ['hardware-encoder-unavailable','Der GPU-Encoder ist nicht verfügbar. Aktualisiere den Grafiktreiber oder wähle den CPU-Encoder.','The GPU encoder is unavailable. Update your graphics driver or select the CPU encoder.'],
    ['microphone-selection-unavailable','Wähle dein Mikrofon unter Audio & Mikrofon erneut aus.','Select your microphone again under Audio & microphone.'],
    ['application-audio-unsupported','Getrennte Anwendungsaufnahme benötigt Windows ab Build 20348. Die gewählten Desktop- und Mikrofonspuren bleiben verfügbar.','Separate application capture requires Windows build 20348 or newer. Your selected desktop and microphone tracks remain available.'],
    ['output-selection-unavailable','Wähle für den Desktop-Ton das Windows-Standardgerät.','Choose the Windows default device for desktop audio.'],
    ['selected-display-unavailable','Der gewählte Bildschirm ist nicht verfügbar. Wähle einen angeschlossenen Monitor.','The selected display is unavailable. Choose a connected monitor.'],
    ['display-mapping-unavailable','Der Bildschirm konnte nicht eindeutig zugeordnet werden. Wähle die Aufnahmequelle erneut.','The display could not be identified reliably. Select the recording source again.'],
    ['native-replay-buffering','Der Replay-Buffer lädt noch. Bitte kurz warten.','The replay buffer is still warming up. Please wait a moment.'],
    ['native-replay-timeout','Der Replay-Buffer hat keine neuen Videodaten geliefert.','The replay buffer stopped providing new video frames.'],
    ['native-replay-gap','Der Replay-Buffer enthält eine Unterbrechung. Dieser Clip konnte nicht vollständig gesichert werden.','The replay buffer contains a recording gap. This clip could not be saved completely.'],
    ['native-replay-unavailable','Starte zuerst den Replay-Buffer.','Start the replay buffer first.'],
    ['native-recovery-failed','Die Aufnahme konnte nicht wiederhergestellt werden. Prüfe die Quelle und starte den Replay-Buffer erneut.','Recording could not be restored. Check the source and restart the replay buffer.'],
    ['native-capture-stopped','Die Aufnahme wurde unterbrochen. Eclipse verbindet die native Engine erneut.','Recording was interrupted. Eclipse is reconnecting the native engine.'],
    ['clip-queue-full','Drei Clips werden bereits verarbeitet. Bitte kurz warten.','Three clips are already being processed. Please wait a moment.'],
  ]
  const known=messages.find(([key])=>code.includes(key))
  return known?known[de?1:2]:de?'Die native Aufnahme konnte nicht abgeschlossen werden. Prüfe Aufnahmequelle, Audiogeräte und Grafiktreiber.':'Native recording could not complete. Check the recording source, audio devices and graphics driver.'
}
