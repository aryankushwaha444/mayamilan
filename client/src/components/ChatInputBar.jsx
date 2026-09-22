import { useEffect, useRef, useState } from "react";
import { compressChatImage } from "../utils/imageCompressor";
import { useAlert } from "../context/AlertContext";

const EMOJIS = [
  "😀",
  "😂",
  "😍",
  "🥰",
  "😎",
  "🤔",
  "😢",
  "😡",
  "👍",
  "💃",
  "🌹",
  "🔥",
  "🐱",
  "🎉",
  "❤️",
  "💔",
  "✨",
  "👀",
];

const STICKERS = [
  "😂",
  "😍",
  "🥳",
  "😭",
  "😡",
  "👍",
  "✨",
  "👀",
  "💃",
  "🌹",
  "🎂",
  "🐱",
];

const GIFS = [
  "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif",
  "https://media.giphy.com/media/3o7aCSPqXE5C6T8tBC/giphy.gif",
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif",
  "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
  "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif",
];

// ✅ UX-only constants
const MAX_TEXT_LENGTH = 2000;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

function ChatInputBar({ onSend, disabled }) {
  const toast = useAlert();

  const [text, setText] = useState("");
  const [panel, setPanel] = useState(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [compressing, setCompressing] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const cancelRef = useRef(false);
  const fileRef = useRef(null);
  const composerRef = useRef(null);
  const inputRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    };
  }, []);

  // Close panels on outside click
  useEffect(() => {
    if (!panel && !plusOpen) return;

    const handleOutsideClick = (event) => {
      if (composerRef.current && !composerRef.current.contains(event.target)) {
        setPanel(null);
        setPlusOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [panel, plusOpen]);

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
      2,
      "0"
    )}`;

  const submitText = async () => {
    if (!text.trim()) return;

    const payload = { type: "text", text };
    setText("");
    setPanel(null);

    try {
      await onSend(payload);
    } catch (error) {
      toast.error("Failed to send message");
      setText(text);
    }

    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleTextChange = (e) => {
    const value = e.target.value;
    if (value.length <= MAX_TEXT_LENGTH) {
      setText(value);
    }
  };

  const handleInputFocus = () => {
    setTimeout(() => {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 250);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRef.current = false;

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        setSeconds(0);

        if (!cancelRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const file = new File([blob], `voice-${Date.now()}.webm`, {
            type: "audio/webm",
          });

          try {
            setSendingMedia(true);
            await onSend({ type: "voice", file });
          } catch (error) {
            toast.error("Failed to send voice message");
          } finally {
            setSendingMedia(false);
          }
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      toast.error(
        "Microphone access denied. Please allow microphone permissions.",
        "Permission needed",
        5000
      );
    }
  };

  const stopAndSend = () => {
    cancelRef.current = false;
    recorderRef.current?.stop();
  };

  const cancelRecording = () => {
    cancelRef.current = true;
    recorderRef.current?.stop();
  };

  // ✅ UX-ONLY validation (backend does security validation)
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic size check (save bandwidth - backend also checks)
    if (file.size > MAX_FILE_SIZE) {
      toast.warning(`Image must be less than ${MAX_FILE_SIZE_MB}MB`);
      e.target.value = "";
      return;
    }

    try {
      setCompressing(true);
      toast.info("Optimizing image...", "Compressing", 2000);

      const compressedFile = await compressChatImage(file);

      setSendingMedia(true);
      // Backend does all security validation
      await onSend({ type: "image", file: compressedFile });
    } catch (error) {
      console.error("Image upload error:", error);
      toast.error(error.response?.data?.message || "Failed to send image");
    } finally {
      setCompressing(false);
      setSendingMedia(false);
      e.target.value = "";
    }
  };

  const safeSend = async (payload) => {
    try {
      setSendingMedia(true);
      setPanel(null);
      await onSend(payload);
    } catch (error) {
      toast.error("Failed to send");
    } finally {
      setSendingMedia(false);
    }
  };

  const isDisabled = disabled || compressing || sendingMedia;

  return (
    <div className="chat-composer" ref={composerRef}>
      {recording ? (
        <div className="composer-recording">
          <span className="rec-dot"></span>
          <span className="rec-time" aria-live="polite">
            Recording {fmt(seconds)}
          </span>
          <button
            className="composer-icon"
            onClick={stopAndSend}
            title="Send voice message"
            aria-label="Send voice message"
          >
            <i className="bi bi-send-fill"></i>
          </button>
          <button
            className="composer-icon"
            onClick={cancelRecording}
            title="Cancel recording"
            aria-label="Cancel recording"
          >
            <i className="bi bi-trash"></i>
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={`composer-plus-btn ${plusOpen ? "active" : ""}`}
            onClick={() => setPlusOpen((p) => !p)}
            title="Attachments"
            disabled={isDisabled}
            aria-label="Open attachments menu"
            aria-expanded={plusOpen}
          >
            <i
              className={`bi ${
                compressing ? "bi-arrow-clockwise" : "bi-plus-lg"
              }`}
            ></i>
          </button>

          <div className="composer-desktop-icons">
            <button
              className="composer-icon"
              onClick={startRecording}
              title="Voice message"
              disabled={isDisabled}
              aria-label="Record voice message"
            >
              <i className="bi bi-mic-fill"></i>
            </button>

            <button
              className="composer-icon"
              onClick={() => fileRef.current?.click()}
              title="Send image"
              disabled={isDisabled}
              aria-label="Upload image"
            >
              <i
                className={`bi ${
                  compressing ? "bi-arrow-clockwise" : "bi-image-fill"
                }`}
              ></i>
            </button>

            <button
              className={`composer-icon ${panel === "sticker" ? "active" : ""}`}
              onClick={() => setPanel(panel === "sticker" ? null : "sticker")}
              title="Stickers"
              disabled={isDisabled}
              aria-label="Open sticker panel"
              aria-expanded={panel === "sticker"}
            >
              <i className="bi bi-emoji-smile-upside-down-fill"></i>
            </button>

            <button
              className={`composer-icon ${panel === "gif" ? "active" : ""}`}
              onClick={() => setPanel(panel === "gif" ? null : "gif")}
              title="GIF"
              disabled={isDisabled}
              aria-label="Open GIF panel"
              aria-expanded={panel === "gif"}
            >
              <span className="composer-gif-label">GIF</span>
            </button>
          </div>

          {/* ✅ Accept all images - backend validates */}
          <input
            type="file"
            accept="image/*"
            className="d-none"
            ref={fileRef}
            onChange={handleImageUpload}
          />

          <div className="composer-input-wrap">
            <input
              ref={inputRef}
              type="text"
              value={text}
              placeholder="Aa"
              disabled={isDisabled}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitText();
                }
              }}
              onFocus={handleInputFocus}
              maxLength={MAX_TEXT_LENGTH}
              aria-label="Message input"
            />

            <button
              className={`composer-icon ${panel === "emoji" ? "active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPanel(panel === "emoji" ? null : "emoji")}
              title="Emoji"
              disabled={isDisabled}
              aria-label="Open emoji panel"
              aria-expanded={panel === "emoji"}
            >
              <i className="bi bi-emoji-smile-fill"></i>
            </button>
          </div>

          <button
            className="composer-heart"
            onClick={() => safeSend({ type: "heart" })}
            title="Send love"
            disabled={isDisabled}
            aria-label="Send heart"
          >
            <i className="bi bi-heart-fill"></i>
          </button>
        </>
      )}

      {plusOpen && (
        <div className="plus-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPlusOpen(false);
              startRecording();
            }}
            disabled={isDisabled}
          >
            <i className="bi bi-mic-fill"></i>
            <span>Voice Message</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPlusOpen(false);
              fileRef.current?.click();
            }}
            disabled={isDisabled}
          >
            <i className="bi bi-image-fill"></i>
            <span>Photo</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPlusOpen(false);
              setPanel("gif");
            }}
            disabled={isDisabled}
          >
            <span className="composer-gif-label plus-gif-label">GIF</span>
            <span>GIF</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPlusOpen(false);
              setPanel("sticker");
            }}
            disabled={isDisabled}
          >
            <i className="bi bi-emoji-smile-upside-down-fill"></i>
            <span>Sticker</span>
          </button>
        </div>
      )}

      {panel === "emoji" && (
        <div className="composer-panel emoji-panel" role="grid">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setText((t) => (t + e).slice(0, MAX_TEXT_LENGTH))}
              aria-label={`Add ${e} emoji`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {panel === "sticker" && (
        <div className="composer-panel sticker-panel" role="grid">
          {STICKERS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => safeSend({ type: "sticker", text: e })}
              aria-label={`Send ${e} sticker`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {panel === "gif" && (
        <div className="composer-panel gif-panel" role="grid">
          {GIFS.map((url) => (
            <img
              key={url}
              src={url}
              alt="GIF"
              onClick={() => safeSend({ type: "gif", attachment: { url } })}
              style={{ cursor: "pointer" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ChatInputBar;
