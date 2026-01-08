import './style.css'

const recordBtn = document.getElementById('record-btn');
const transcriptArea = document.getElementById('transcript');
const statusIndicator = document.getElementById('status-indicator');
const sendBtn = document.getElementById('send-btn');
const copyBtn = document.getElementById('copy-btn');
const clearBtn = document.getElementById('clear-btn');
const subjectInput = document.getElementById('email-subject');

let recognition;
let isRecording = false;

// State to manage concurrent typing + dictation
let committedText = "";

// Initialize committedText on load
committedText = transcriptArea.value;

// Update committedText whenever user types manually
transcriptArea.addEventListener('input', () => {
  committedText = transcriptArea.value;
});

// Check for browser support
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'fr-FR';

  recognition.onstart = () => {
    isRecording = true;
    recordBtn.classList.add('recording');
    statusIndicator.textContent = "Écoute en cours...";
    statusIndicator.style.color = "#d35400";

    // Sync committed text just in case
    committedText = transcriptArea.value;
  };

  recognition.onend = () => {
    isRecording = false;
    recordBtn.classList.remove('recording');
    statusIndicator.textContent = "Touchez le micro pour parler";
    statusIndicator.style.color = "var(--text-secondary)";

    // Ensure final state is clean
    transcriptArea.value = committedText;
  };

  recognition.onresult = (event) => {
    let interimString = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const result = event.results[i];
      const rawTranscript = result[0].transcript;

      if (result.isFinal) {
        // Format and commit final result
        const formatted = formatTranscript(rawTranscript, committedText);
        committedText += formatted;
      } else {
        // Build interim string (do not commit yet)
        // We also formats interim for preview, but loosely
        interimString += rawTranscript;
      }
    }

    // Display: Committed + Formatted Interim
    // We try to format interim nicely too so it looks like the final result
    let displayInterim = "";
    if (interimString) {
      displayInterim = formatTranscript(interimString, committedText);
    }

    transcriptArea.value = committedText + displayInterim;
    transcriptArea.scrollTop = transcriptArea.scrollHeight;

    // Status update (optional, just to show activity if silent)
    if (!interimString) {
      statusIndicator.textContent = "Écoute en cours...";
    } else {
      statusIndicator.textContent = "...";
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error", event.error);
    if (event.error === 'no-speech') {
      statusIndicator.textContent = "Aucune parole détectée.";
    } else if (event.error === 'audio-capture') {
      statusIndicator.textContent = "Aucun micro.";
    } else if (event.error === 'not-allowed') {
      statusIndicator.textContent = "Permission refusée.";
    } else {
      statusIndicator.textContent = "Erreur: " + event.error;
    }
    statusIndicator.style.color = "#e74c3c";
    isRecording = false;
    recordBtn.classList.remove('recording');
  };

} else {
  statusIndicator.textContent = "API non supportée.";
  recordBtn.disabled = true;
}

recordBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isRecording) {
    recognition.stop();
  } else {
    recognition.start();
  }
});

sendBtn.addEventListener('click', () => {
  const body = transcriptArea.value;
  const subject = subjectInput ? subjectInput.value : "Note Dictée";

  if (!body) {
    alert("Veuillez dicter du texte d'abord !");
    return;
  }

  // Update button state
  const originalText = sendBtn.innerText;
  sendBtn.innerText = "Envoi en cours...";
  sendBtn.disabled = true;

  const serviceID = "service_lipbp2d";
  const templateID = "template_9z4nn4l";

  const templateParams = {
    subject: subject,
    message: body
  };

  emailjs.send(serviceID, templateID, templateParams)
    .then(() => {
      alert("Email envoyé avec succès !");
      transcriptArea.value = ""; // Optional: Clear after send
      committedText = "";
    }, (err) => {
      alert("Erreur lors de l'envoi : " + JSON.stringify(err));
    })
    .finally(() => {
      sendBtn.innerText = originalText;
      sendBtn.disabled = false;
    });
});

copyBtn.addEventListener('click', () => {
  if (!transcriptArea.value) return;
  navigator.clipboard.writeText(transcriptArea.value).then(() => {
    const originalText = copyBtn.textContent;
    copyBtn.textContent = "Copié !";
    copyBtn.style.backgroundColor = "#27ae60";
    copyBtn.style.color = "white";
    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.backgroundColor = "";
      copyBtn.style.color = "";
    }, 2000);
  });
});

clearBtn.addEventListener('click', () => {
  transcriptArea.value = "";
  committedText = "";
});

/**
 * Formats the transcript.
 * Fixed: Trimming logic now preserves newlines to correctly detect 'end of paragraph'.
 */
function formatTranscript(text, previousContent) {
  let formatted = text;

  // 1. Basic Punctuation Replacement
  formatted = formatted
    .replace(/\s+virgule/gi, ",")
    .replace(/virgule/gi, ",")
    .replace(/\s*point/gi, ".")
    // Normalize new lines
    .replace(/\s*(à|a) la ligne/gi, "\n");

  // 2. Trim ONLY spaces to preserve newlines
  formatted = formatted.replace(/^ +| +$/g, '');

  // 3. Smart Spacing & Capitalization
  // Detect last significant character of previous content
  // We remove ONLY trailing spaces/tabs, but keep newlines
  const prevClean = previousContent.replace(/ +$/, '');
  const lastChar = prevClean.slice(-1);
  const isStart = prevClean.length === 0;

  // Check triggers
  const endsWithPunct = ['.', '!', '?', '\n'].includes(lastChar);

  // Spacing: Add space if not start, not newline, and new text isn't punctuation
  let needsSpace = !isStart && lastChar !== '\n';
  if (/^[.,!?;:]/.test(formatted)) {
    needsSpace = false;
  }

  // Capitalization: Start of doc OR after punctuation/newline
  let needsCap = isStart || endsWithPunct;

  if (needsCap) {
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  // Internal Capitalization (for embedded newlines/sentences)
  formatted = formatted.replace(/(\n|[.!?])\s*([a-zà-ÿ])/g, (match, sep, letter) => {
    // If sep is newline, no space after. If punct, add space.
    const spacer = sep === '\n' ? '' : ' ';
    return sep + spacer + letter.toUpperCase();
  });

  return (needsSpace ? " " : "") + formatted;
}

