import { useEffect, useRef, useState } from "react";

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

function ChatInputBar({ onSend, disabled }) {
  const [text, setText] = useState("");
  const [panel, setPanel] = useState(null); // "emoji" | "gif" | "sticker"
  const [plusOpen, setPlusOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const cancelRef = useRef(false);
  const fileRef = useRef(null);
  const composerRef = useRef(null);

  //  CLOSE PANELS + PLUS MENU ON OUTSIDE CLICK
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current?.state === "recording")
        recorderRef.current.stop();
    };
  }, []);

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
      2,
      "0"
    )}`;

  const submitText = () => {
    if (!text.trim()) return;
    onSend({ type: "text", text });
    setText("");
    setPanel(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRef.current = false;

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        setSeconds(0);

        if (!cancelRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const file = new File([blob], `voice-${Date.now()}.webm`, {
            type: "audio/webm",
          });
          onSend({ type: "voice", file });
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      alert("Microphone access denied.");
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

  return (
    <div className="chat-composer" ref={composerRef}>
      {recording ? (
        <div className="composer-recording">
          <span className="rec-dot"></span>
          <span className="rec-time">Recording {fmt(seconds)}</span>
          <button
            className="composer-icon"
            onClick={stopAndSend}
            title="Send voice message"
          >
            <i className="bi bi-send-fill"></i>
          </button>
          <button
            className="composer-icon"
            onClick={cancelRecording}
            title="Cancel recording"
          >
            <i className="bi bi-trash"></i>
          </button>
        </div>
      ) : (
        <>
          {/* MOBILE: + BUTTON (voice / photo / gif / sticker) */}
          <button
            type="button"
            className={`composer-plus-btn ${plusOpen ? "active" : ""}`}
            onClick={() => setPlusOpen((p) => !p)}
            title="Attachments"
          >
            <i className="bi bi-plus-lg"></i>
          </button>

          {/* DESKTOP ICONS (hidden on mobile) */}
          <div className="composer-desktop-icons">
            <button
              className="composer-icon"
              onClick={startRecording}
              title="Voice message"
            >
              <i className="bi bi-mic-fill"></i>
            </button>

            <button
              className="composer-icon"
              onClick={() => fileRef.current?.click()}
              title="Send image"
            >
              <i className="bi bi-image-fill"></i>
            </button>

            <button
              className={`composer-icon ${panel === "sticker" ? "active" : ""}`}
              onClick={() => setPanel(panel === "sticker" ? null : "sticker")}
              title="Stickers"
            >
              <i className="bi bi-emoji-smile-upside-down-fill"></i>
            </button>

            <button
              className={`composer-icon ${panel === "gif" ? "active" : ""}`}
              onClick={() => setPanel(panel === "gif" ? null : "gif")}
              title="GIF"
            >
              <span className="composer-gif-label">GIF</span>
            </button>
          </div>

          <input
            type="file"
            accept="image/*"
            className="d-none"
            ref={fileRef}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSend({ type: "image", file: f });
              e.target.value = "";
            }}
          />

          <div className="composer-input-wrap">
            <input
              type="text"
              value={text}
              placeholder="Aa"
              disabled={disabled}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitText()}
            />

            {/* 👇 EMOJI inside input — visible on BOTH desktop & mobile */}
            <button
              className={`composer-icon ${panel === "emoji" ? "active" : ""}`}
              onClick={() => setPanel(panel === "emoji" ? null : "emoji")}
              title="Emoji"
            >
              <i className="bi bi-emoji-smile-fill"></i>
            </button>
          </div>

          <button
            className="composer-heart"
            onClick={() => onSend({ type: "heart" })}
            title="Send love"
          >
            <i className="bi bi-heart-fill"></i>
          </button>
        </>
      )}

      {/* 👇 + MENU: voice / photo / gif / STICKER (emoji removed — it's in the input) */}
      {plusOpen && (
        <div className="plus-menu">
          <button
            type="button"
            onClick={() => {
              setPlusOpen(false);
              startRecording();
            }}
          >
            <i className="bi bi-mic-fill"></i>
            <span>Voice Message</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPlusOpen(false);
              fileRef.current?.click();
            }}
          >
            <i className="bi bi-image-fill"></i>
            <span>Photo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPlusOpen(false);
              setPanel("gif");
            }}
          >
            <span className="composer-gif-label plus-gif-label">GIF</span>
            <span>GIF</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPlusOpen(false);
              setPanel("sticker");
            }}
          >
            <i className="bi bi-emoji-smile-upside-down-fill"></i>
            <span>Sticker</span>
          </button>
        </div>
      )}

      {/* Panels (emoji / sticker / gif) — shared by desktop & mobile */}
      {panel === "emoji" && (
        <div className="composer-panel emoji-panel">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => setText((t) => t + e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {panel === "sticker" && (
        <div className="composer-panel sticker-panel">
          {STICKERS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onSend({ type: "sticker", text: e });
                setPanel(null);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {panel === "gif" && (
        <div className="composer-panel gif-panel">
          {GIFS.map((url) => (
            <img
              key={url}
              src={url}
              alt="gif"
              onClick={() => {
                onSend({ type: "gif", attachment: { url } });
                setPanel(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ChatInputBar;
