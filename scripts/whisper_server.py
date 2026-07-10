#!/usr/bin/env python3
"""Serveur local de transcription Whisper — port 8766"""

import os
import tempfile
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

app = Flask(__name__)

print("[Whisper] Chargement du modèle 'small' (première fois : ~500 MB)...")
model = WhisperModel("small", device="cpu", compute_type="int8")
print("[Whisper] Modèle prêt.")

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "Aucun fichier audio"}), 400

    audio_file = request.files["audio"]
    suffix = ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        audio_file.save(tmp_path)

    try:
        segments, info = model.transcribe(tmp_path, language="fr", beam_size=5)
        text = " ".join(s.text.strip() for s in segments).strip()
        return jsonify({"text": text, "language": info.language})
    finally:
        os.unlink(tmp_path)

@app.route("/ping")
def ping():
    return jsonify({"ok": True})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8766, debug=False)
