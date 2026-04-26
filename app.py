# ============================
# SynOps — backend/app.py
# Flask backend that receives an uploaded image,
# sends it to the Google Gemini API for analysis,
# and returns a structured JSON response.
# ============================

import os
import base64
import json
import re
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

# --- App setup ---
app = Flask(__name__)

# Allow requests from your frontend (any origin for hackathon simplicity)
CORS(app)

# --- Gemini API setup ---
# Your API key should be stored in the environment variable GEMINI_API_KEY
# Never hardcode API keys in source code!
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("⚠️  WARNING: GEMINI_API_KEY environment variable is not set.")
    print("   Set it with: export GEMINI_API_KEY='your_key_here'")
else:
    genai.configure(api_key=GEMINI_API_KEY)

# --- Allowed image types ---
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}
MAX_FILE_SIZE_MB = 10

def allowed_file(filename):
    """Check if file extension is allowed."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# --- The Gemini prompt ---
# This prompt tells Gemini exactly what structured output we want.
ANALYSIS_PROMPT = """
You are a sports media copyright analyst AI.

Analyze this image carefully and respond ONLY with a valid JSON object (no markdown, no code blocks, just raw JSON).

Return this exact JSON structure:
{
  "description": "A clear 1-2 sentence description of what the image shows",
  "is_sports_related": true or false,
  "sports_explanation": "Why this is or is not sports-related",
  "reuse_risk": "Assessment of whether this image could be unauthorized/duplicated sports media. Mention if it looks like a broadcast screenshot, licensed photo, official team content, or generic content.",
  "risk_level": "low | medium | high",
  "risk_reason": "One sentence explaining the risk level"
}

Be concise but informative. Think like a media rights expert.
"""


@app.route("/", methods=["GET"])
def index():
    """Health check route — useful when deployed on Render."""
    return jsonify({"status": "SynOps backend is running ✅"})


@app.route("/analyze", methods=["POST"])
def analyze():
    """
    POST /analyze
    Accepts a multipart form with an 'image' file.
    Returns JSON with Gemini's analysis.
    """

    # 1. Check API key is configured
    if not GEMINI_API_KEY:
        return jsonify({"error": "Gemini API key not configured on the server."}), 500

    # 2. Check that an image was included in the request
    if "image" not in request.files:
        return jsonify({"error": "No image file provided. Send the file with key 'image'."}), 400

    file = request.files["image"]

    # 3. Check that a file was actually selected
    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    # 4. Validate file type
    if not allowed_file(file.filename):
        return jsonify({"error": f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    # 5. Read the file bytes and encode as base64 for Gemini
    try:
        image_bytes = file.read()
    except Exception as e:
        return jsonify({"error": f"Failed to read file: {str(e)}"}), 500

    # 6. Check file size (rough check after reading)
    size_mb = len(image_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        return jsonify({"error": f"File too large ({size_mb:.1f}MB). Max is {MAX_FILE_SIZE_MB}MB."}), 400

    # 7. Detect MIME type from extension
    ext = file.filename.rsplit(".", 1)[1].lower()
    mime_map = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif"
    }
    mime_type = mime_map.get(ext, "image/jpeg")

    # 8. Send to Gemini API
    try:
        model = genai.GenerativeModel("gemini-flash-latest")

        # Gemini accepts inline image data as a dict
        image_part = {
            "inline_data": {
                "mime_type": mime_type,
                "data": base64.b64encode(image_bytes).decode("utf-8")
            }
        }

        response = model.generate_content([ANALYSIS_PROMPT, image_part])

        # 9. Parse Gemini's response as JSON
        raw_text = response.text.strip()

        # Strip markdown code fences if Gemini adds them (sometimes it does)
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)

        result = json.loads(raw_text)

        # 10. Return the structured result
        return jsonify(result), 200

    except json.JSONDecodeError:
        # Gemini returned something we couldn't parse as JSON
        return jsonify({
            "error": "Gemini returned an unexpected response format.",
            "raw_response": response.text if "response" in locals() else "No response"
        }), 500

    except Exception as e:
        return jsonify({"error": f"Gemini API error: {str(e)}"}), 500


# --- Run the app ---
if __name__ == "__main__":
    # In production (Render), gunicorn will handle this instead
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
