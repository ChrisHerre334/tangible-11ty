/*jshint esversion: 8 */
import Tangible from "./tangible.js";

class SoundRecorder {
    constructor(tangible) {
        this.tangible = tangible;

        // Initialise values
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingSlot = null;
        this.maxRecordingTime = 5;  // seconds
        this.recordingInterval = null;
        this.recordingStartTime = null;
        this.stream = null;
        this.hasRequestedPermission = false;

        console.log("SoundRecorder constructor called");
        this.initEventListeners();

        // Add CSS for recording feedback
        this.addStyles();
    }

    // Add CSS styles for visual feedback
    addStyles() {
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            .recording-confirmed {
                animation: pulse 0.8s 1;
                box-shadow: 0 0 0 rgba(204,169,44, 0.4);
            }
            
            @keyframes pulse {
                0% {
                    box-shadow: 0 0 0 0 rgba(44, 204, 44, 0.7);
                    background-color: rgba(44, 204, 44, 0.7);
                }
                70% {
                    box-shadow: 0 0 0 10px rgba(44, 204, 44, 0);
                    background-color: rgba(44, 204, 44, 0.5);
                }
                100% {
                    box-shadow: 0 0 0 0 rgba(44, 204, 44, 0);
                    background-color: rgba(44, 204, 44, 0);
                }
            }
        `;
        document.head.appendChild(styleElement);
    }

    // Ask for microphone access and do a callback if allowed
    requestMicrophoneAccess(callback) {
        console.log("Requesting microphone access...");

        // Set flag to prevent multiple requests
        this.hasRequestedPermission = true;

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                console.log("Microphone access granted!");
                this.stream = stream;

                this.showPermissionFeedback(true);

                if (callback && typeof callback === 'function') {
                    callback(true);
                }
            })
            .catch(error => {
                console.error("Error accessing microphone:", error);

                this.showPermissionFeedback(false);

                if (callback && typeof callback === 'function') {
                    callback(false);
                }
            });
    }

    // Show visual feedback for microphone permission
    showPermissionFeedback(granted) {
        const feedback = document.createElement('div');

        if (granted) {
            feedback.textContent = "✓ Microphone access granted";
            feedback.style.backgroundColor = "#28a745";
        } else {
            feedback.textContent = "❌ Microphone access denied";
            feedback.style.backgroundColor = "#dc3545";
        }

        feedback.style.cssText += `
            position: fixed;
            top: 10px;
            right: 10px;
            color: white;
            padding: 10px;
            border-radius: 4px;
            z-index: 10000;
        `;
        document.body.appendChild(feedback);

        // Remove feedback after 3 seconds
        setTimeout(() => {
            feedback.remove();
        }, 3000);
    }

    // Visual feedback when audio can't be played
    showPlaybackFeedback(letter) {
        // Find the record button for this letter
        const recordButton = document.querySelector(`.record-button[data-letter="${letter}"]`);
        if (!recordButton) return;

        // Create a temporary visual pulse effect
        recordButton.classList.add('recording-confirmed');

        // Show feedback for 800ms then remove
        setTimeout(() => {
            recordButton.classList.remove('recording-confirmed');
        }, 800);
    }

    // Initialise event listeners for the custom sound set UI
    initEventListeners() {
        console.log("Initializing event listeners");

        // Record buttons
        const recordButtons = document.querySelectorAll('.record-button');
        console.log(`Found ${recordButtons.length} record buttons`);

        recordButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const letter = e.currentTarget.dataset.letter;
                this.handleRecordButtonClick(letter, e.currentTarget);
            });
        });

        // Discard buttons
        const discardButtons = document.querySelectorAll('.discard-button');
        console.log(`Found ${discardButtons.length} discard buttons`);

        discardButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const letter = e.currentTarget.dataset.letter;
                this.discardRecording(letter);
            });
            button.disabled = true;
        });

        // Submit button
        const submitButton = document.getElementById('submit-sound-set');
        if (submitButton) {
            console.log("Found submit button");
            submitButton.addEventListener('click', () => {
                this.saveSessionSoundSet();
            });
        } else {
            console.log("Submit button not found");
        }

        // Enable discard buttons for any existing recordings
        if (this.tangible.sessionSoundSet) {
            for (const letter in this.tangible.sessionSoundSet) {
                const discardButton = document.querySelector(`.discard-button[data-letter="${letter}"]`);
                if (discardButton) {
                    discardButton.disabled = false;
                }
            }
        }
    }

    // Toggle recording for a specific slot
    handleRecordButtonClick(letter, button) {
        console.log("Record button clicked for letter:", letter);

        // If already recording this slot, stop
        if (this.recordingSlot === letter) {
            this.stopRecording();
            return;
        }

        // If we already have a stream, use it directly
        if (this.stream && this.stream.active) {
            this.toggleRecording(letter, button);
            return;
        }

        // Otherwise request microphone access again
        this.requestMicrophoneAccess((granted) => {
            if (granted) {
                this.toggleRecording(letter, button);
            } else {
                // Show a simple alert if permission was denied
                alert("You need to allow microphone access to record sounds.");
            }
        });
    }

    toggleRecording(letter, button) {
        console.log("Toggling recording for letter:", letter);

        // If recording another slot, stop that first
        if (this.recordingSlot) {
            this.stopRecording();
        }

        // Start recording this slot
        this.recordingSlot = letter;
        button.classList.add('recording');

        // Reset progress bar
        const progressBar = document.querySelector(`.progress-bar[data-letter="${letter}"]`);
        if (progressBar) {
            progressBar.style.width = '0%';
        } else {
            console.error("Progress bar not found for letter:", letter);
        }

        this.startRecording(letter);

        // Timer
        this.recordingStartTime = Date.now();
        this.recordingInterval = setInterval(() => {
            const elapsed = (Date.now() - this.recordingStartTime) / 1000;
            const progress = Math.min(elapsed / this.maxRecordingTime * 100, 100);

            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }

            // Stop recording if max time reached
            if (elapsed >= this.maxRecordingTime) {
                this.stopRecording(letter);
            }
        }, 100);
    }

    startRecording(letter) {
        console.log("Starting recording...");
        this.audioChunks = [];

        // If we already have a stream, use it directly
        if (this.stream && this.stream.active) {
            this.setupMediaRecorder(this.stream, letter);
            return;
        }

        // Otherwise request a new stream
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.stream = stream;
                this.setupMediaRecorder(stream, letter);
            })
            .catch(error => {
                console.error("Error starting recording:", error);
                alert("Unable to access microphone. Please check permissions.");
                this.resetRecordingState();
            });
    }

    setupMediaRecorder(stream, letter) {
        console.log("Got audio stream, creating recorder");

        // Detect platform
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        // Choose appropriate MIME type with fallback options
        let options = {};

        // Try to find the best supported format
        const mimeTypes = [
            'audio/webm',     // Best for Chrome/Windows
            'audio/mp4',      // Better for iOS
            'audio/mpeg',     // Another option
            'audio/ogg',      // Another option
            ''                // Empty string = browser default
        ];

        // Find the first supported MIME type
        for (const type of mimeTypes) {
            if (!type || MediaRecorder.isTypeSupported(type)) {
                options.mimeType = type;
                console.log(`Using MIME type: ${type || 'browser default'}`);
                break;
            }
        }

        this.mediaRecorder = new MediaRecorder(stream, options);
        this.mediaRecorder._recordingSlot = letter;

        this.mediaRecorder.addEventListener('dataavailable', event => {
            console.log("Received audio data chunk");
            this.audioChunks.push(event.data);
        });

        this.mediaRecorder.addEventListener('stop', () => {
            const recordedLetter = this.mediaRecorder._recordingSlot;
            console.log("Recording stopped for letter:", recordedLetter, "processing audio");

            if (!recordedLetter) {
                console.error("No letter associated with this recording");
                return;
            }

            // Use the same MIME type that was selected for recording
            const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);

            // Save the audio for this slot
            if (!this.tangible.sessionSoundSet) {
                this.tangible.sessionSoundSet = {};
            }

            // Enable the discard button for this slot
            const discardButton = document.querySelector(`.discard-button[data-letter="${recordedLetter}"]`);
            if (discardButton) {
                console.log(`Enabling discard button for letter ${recordedLetter}`);
                discardButton.disabled = false;
            } else {
                console.error(`Discard button not found for letter ${recordedLetter}`);
            }

            // Convert blob to data URL for storage
            const reader = new FileReader();
            reader.onloadend = () => {
                console.log("Audio converted to data URL for letter:", recordedLetter);
                this.tangible.sessionSoundSet[recordedLetter] = {
                    letter: recordedLetter,
                    dataUrl: reader.result,
                    mimeType: mimeType
                };

                // Create an audio element to test playback
                const audio = new Audio(audioUrl);

                // Safe playback with user feedback regardless of platform
                if (isIOS) {
                    console.log(`Recorded sound for letter ${recordedLetter} (using visual feedback on iOS)`);
                    this.showPlaybackFeedback(recordedLetter);
                } else {
                    // On other platforms, try to play
                    const playPromise = audio.play();
                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => console.log(`Playing recorded sound for letter ${recordedLetter}`))
                            .catch(err => {
                                console.warn(`Cannot auto-play test audio:`, err);
                                // Fall back to visual feedback
                                this.showPlaybackFeedback(recordedLetter);
                            });
                    }
                }
            };
            reader.readAsDataURL(audioBlob);
        });

        this.mediaRecorder.start();
        console.log("MediaRecorder started");
    }

    // Stop the current recording
    stopRecording(letterToStop) {
        const letter = letterToStop || this.recordingSlot;
        console.log("Stopping recording for letter:", letter);

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            // Ensure the letter is stored properly before stopping
            this.mediaRecorder._recordingSlot = letter;
            this.mediaRecorder.stop();
            console.log("MediaRecorder stopped for letter:", letter);
        } else {
            console.log("MediaRecorder already inactive or not created");
        }

        this.resetRecordingState();
    }

    // Reset the recording state
    resetRecordingState() {
        if (this.recordingSlot) {
            const button = document.querySelector(`.record-button[data-letter="${this.recordingSlot}"]`);
            if (button) {
                button.classList.remove('recording');
            }
        }

        this.recordingSlot = null;

        if (this.recordingInterval) {
            clearInterval(this.recordingInterval);
            this.recordingInterval = null;
        }
    }

    // Discard a recording
    discardRecording(letter) {
        console.log("Discarding recording for letter:", letter);
        // Remove from session sound set
        if (this.tangible.sessionSoundSet && this.tangible.sessionSoundSet[letter]) {
            delete this.tangible.sessionSoundSet[letter];
            console.log(`Removed sound for letter ${letter}`);

            // Reset progress bar
            const progressBar = document.querySelector(`.progress-bar[data-letter="${letter}"]`);
            if (progressBar) {
                progressBar.style.width = '0%';
            }

            // Disable the discard button for this slot
            const discardButton = document.querySelector(`.discard-button[data-letter="${letter}"]`);
            if (discardButton) {
                console.log(`Disabling discard button for letter ${letter}`);
                discardButton.disabled = true;
            }
        }
    }

    // Save all recordings as a session sound set
    saveSessionSoundSet() {
        console.log("Saving session sound set...");
        if (!this.tangible.sessionSoundSet || Object.keys(this.tangible.sessionSoundSet).length === 0) {
            alert("Please record at least one sound before saving.");
            return;
        }

        const setName = "Custom_" + new Date().getTime();
        const letterArray = Object.keys(this.tangible.sessionSoundSet);
        console.log("Saving custom sound set:", setName, "with letters:", letterArray);

        // Make sure the correct format is used for tangible sound sets
        // The format must match what tangible.js expects
        this.tangible.soundSets[setName] = [letterArray, []];
        this.updateSoundSetDropdown(setName);
        this.tangible.preloads(setName);

        alert("Your custom sound set has been saved and is now active!");
    }

    // Update the sound set dropdown to include the new custom set
    updateSoundSetDropdown(newSetName) {
        const dropdown = document.getElementById('soundSets');
        if (!dropdown) return;

        // Add the new option
        const option = document.createElement('option');
        option.value = newSetName;
        option.textContent = "My Custom Set";
        option.selected = true;

        dropdown.appendChild(option);
    }

    // Clean up resources when no longer needed
    cleanup() {
        // Stop any ongoing recording
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        // Stop and release media stream tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Clear any intervals
        if (this.recordingInterval) {
            clearInterval(this.recordingInterval);
            this.recordingInterval = null;
        }
    }
}

// Create global function to force microphone permission request
window.requestMicrophonePermission = function () {
    console.log("Global microphone permission request function called");

    // Check if there's an existing SoundRecorder instance
    if (soundRecorderInstance) {
        soundRecorderInstance.requestMicrophoneAccess((granted) => {
            console.log("Microphone permission request handled by SoundRecorder instance:", granted);
        });
        return;
    }

    // Fallback if SoundRecorder instance is not available
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            console.log("Microphone permission granted via global function!");

            // Store on window for possible later use
            window._micStream = stream;

            // Add visual feedback
            const feedback = document.createElement('div');
            feedback.textContent = "✓ Microphone access granted";
            feedback.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background-color: #28a745;
                color: white;
                padding: 10px;
                border-radius: 4px;
                z-index: 10000;
            `;
            document.body.appendChild(feedback);

            // Remove feedback after 3 seconds
            setTimeout(() => {
                feedback.remove();
            }, 3000);
        })
        .catch(error => {
            console.error("Error accessing microphone:", error);

            // Add visual feedback for error
            const feedback = document.createElement('div');
            feedback.textContent = "❌ Microphone access denied";
            feedback.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background-color: #dc3545;
                color: white;
                padding: 10px;
                border-radius: 4px;
                z-index: 10000;
            `;
            document.body.appendChild(feedback);

            // Remove feedback after 3 seconds
            setTimeout(() => {
                feedback.remove();
            }, 3000);
        });
};

// Function to initialize audio, especially for iOS
function initializeAudio() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // Unlock audio on iOS devices
    if (isIOS) {
        console.log("Setting up iOS audio unlock");

        const unlockAudio = () => {
            // Create an audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const audioCtx = new AudioContext();
                // Create and play a short silent sound
                const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
                const source = audioCtx.createBufferSource();
                source.buffer = emptyBuffer;
                source.connect(audioCtx.destination);
                if (source.start) {
                    source.start(0);
                } else {
                    source.noteOn(0);
                }
                console.log("iOS audio context unlocked");
            }

            // Also try to play a silent audio element
            const silentAudio = new Audio();
            silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAABEUdFT0JqZWN0SUQAAAABAAAAMEczVEVOQwAAAAEAAAB4VElUMgAAAAEAAAB4VFNTRQAAAAEAAABNVFJLAAAAAwAAADBpVFVOAAAAAgAAADFNQ0RJAAAABQAAACAAMQ==';
            const promise = silentAudio.play();
            if (promise !== undefined) {
                promise
                    .then(() => console.log("iOS silent audio played"))
                    .catch(e => console.log("iOS silent audio failed:", e));
            }

            // Remove the event listeners after they've served their purpose
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('touchend', unlockAudio);
            document.removeEventListener('mousedown', unlockAudio);
            document.removeEventListener('mouseup', unlockAudio);
            document.removeEventListener('click', unlockAudio);
        };

        // Add event listeners for user interactions
        document.addEventListener('touchstart', unlockAudio);
        document.addEventListener('touchend', unlockAudio);
        document.addEventListener('mousedown', unlockAudio);
        document.addEventListener('mouseup', unlockAudio);
        document.addEventListener('click', unlockAudio);
    }
}

// Add a mic request button inside the sound set div
(function () {
    console.log("Adding mic permission button to sound set div");

    function addMicButton() {
        const soundSetDiv = document.getElementById('custom-sound-set-container');
        if (!soundSetDiv) {
            console.log("Could not find sound set container, waiting...");
            setTimeout(addMicButton, 200);
            return;
        }

        const button = document.createElement('button');
        button.id = 'mic-permission-request-button';
        button.textContent = 'Allow Microphone';
        button.className = 'duo'; // Match the style of other buttons
        button.style.cssText = `
            display: inline-block;
            margin: 5px;
            background-color: #007bff;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
        `;

        button.addEventListener('click', () => {
            window.requestMicrophonePermission();
        });

        // Insert at the top of the sound set div, right after the h2
        const h2 = soundSetDiv.querySelector('h2');
        if (h2 && h2.nextSibling) {
            soundSetDiv.insertBefore(button, h2.nextSibling);
        } else {
            soundSetDiv.appendChild(button);
        }
        console.log("Mic permission button added to sound set div");
    }

    // Wait for DOM content loaded to ensure the container exists
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => setTimeout(addMicButton, 200));
    } else {
        setTimeout(addMicButton, 200);
    }
})();

// Initialize audio system for better iOS compatibility
document.addEventListener('DOMContentLoaded', initializeAudio);

// Initialise the sound recorder with the tangible instance
let soundRecorderInstance;

// Wait for tangible to be initialised before creating the sound recorder
const waitForTangible = setInterval(() => {
    // Check if window.tangible has been created by main.js
    if (window.tangible instanceof Tangible) {
        console.log("Tangible instance found, initializing SoundRecorder");
        soundRecorderInstance = new SoundRecorder(window.tangible);
        clearInterval(waitForTangible);
    }
}, 100);

// Add an event listener for page unload to clean up resources
window.addEventListener('beforeunload', () => {
    if (soundRecorderInstance) {
        soundRecorderInstance.cleanup();
    }
});

// Export the class for potential future use
export default SoundRecorder;