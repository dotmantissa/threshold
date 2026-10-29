# Capture face check

These files are the locally hosted MediaPipe Tasks Vision runtime and short range face detector. Capture loads them only when a photo is prepared. No photo is sent to a face detection service.

MediaPipe is distributed under the Apache 2.0 license. Runtime source and model information: https://github.com/google-ai-edge/mediapipe and https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector.

The detector is a capture aid. It can miss faces, and it does not detect documents. Every photo also requires explicit privacy review.
