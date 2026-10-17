// src/utils/callSounds.ts — ringtone via LAZY expo-audio (installed) so a stale native
// build degrades to silence instead of crashing the app (the ExponentAV lesson).
const RING = require("../../assets/sounds/incoming-ringtone.mp3");
let player: any = null;
export async function playRingtone(): Promise<void> {
  try {
    const { Audio } = require("expo-audio");
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    player?.remove?.();
    player = new Audio.Sound();
    await player.loadAsync(RING);
    await player.setIsLoopingAsync(true);
    await player.playAsync();
  } catch {
    /* no sound is acceptable; never crash a call */
  }
}
export async function stopRingtone(): Promise<void> {
  try {
    await player?.stopAsync?.();
    await player?.unloadAsync?.();
  } catch {}
  player = null;
}
