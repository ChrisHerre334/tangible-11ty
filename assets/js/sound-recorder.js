/*jshint esversion: 8 */
import Tangible from "./tangible.js";

class SoundRecorder {
    constructor(tangible) {
        this.tangible = tangible;

        // Audio recorder functionality
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingSlot = null;
        this.maxRecordingTime = 5;  // seconds
        this.recordingInterval = null;
        this.recordingStartTime = null;

        // Initialise when DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            this.initEventListeners();
            this.requestMicrophonePermission();
        });
    }

    // Ask for microphone permission
    requestMicrophonePermission() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                // Just get permission, then stop it
                stream.getTracks().forEach(track => track.stop());
            })
            .catch(error => {
                console.error("Error requesting microphone permission:", error);
            });
    }

    // Initialise event listeners for the custom sound set UI
    initEventListeners() {
        // Record buttons
        const recordButtons = document.querySelectorAll('.record-button');
        recordButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const letter = e.currentTarget.dataset.letter;
                this.toggleRecording(letter, e.currentTarget);
            });
        });

        // Discard buttons
        const discardButtons = document.querySelectorAll('.discard-button');
        discardButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const letter = e.currentTarget.dataset.letter;
                this.discardRecording(letter);
            });
        });

        // Submit button
        const submitButton = document.getElementById('submit-sound-set');
        if (submitButton) {
            submitButton.addEventListener('click', () => {
                this.saveSessionSoundSet();
            });
        }
    }

    // Toggle recording for a specific slot
    toggleRecording(letter, button) {
        // If already recording this slot, stop recording
        if (this.recordingSlot === letter) {
            this.stopRecording();
            return;
        }

        // If recording another slot, stop that first
        if (this.recordingSlot) {
            this.stopRecording();
        }

        // Start recording this slot
        this.recordingSlot = letter;
        button.classList.add('recording');

        // Reset progress bar
        const progressBar = document.querySelector(`.progress-bar[data-letter="${letter}"]`);
        progressBar.style.width = '0%';

        this.startRecording();

        // Timer
        this.recordingStartTime = Date.now();
        this.recordingInterval = setInterval(() => {
            const elapsed = (Date.now() - this.recordingStartTime) / 1000;
            const progress = Math.min(elapsed / this.maxRecordingTime * 100, 100);

            progressBar.style.width = `${progress}%`;

            // Stop recording if max time reached
            if (elapsed >= this.maxRecordingTime) {
                this.stopRecording();
            }
        }, 100);
    }

    // Start recording Audio
    startRecording() {
        this.audioChunks = [];

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.mediaRecorder = new MediaRecorder(stream);

                this.mediaRecorder.addEventListener('dataavailable', event => {
                    this.audioChunks.push(event.data);
                });

                this.mediaRecorder.addEventListener('stop', () => {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    const audioUrl = URL.createObjectURL(audioBlob);

                    if (this.recordingSlot) {
                        // Save the audio for this slot
                        if (!this.tangible.sessionSoundSet) {
                            this.tangible.sessionSoundSet = {};
                        }

                        // Create a reader to convert blob to data URL for storage
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            this.tangible.sessionSoundSet[this.recordingSlot] = {
                                letter: this.recordingSlot,
                                dataUrl: reader.result
                            };

                            // Enable the discard button
                            const discardButton = document.querySelector(`.discard-button[data-letter="${this.recordingSlot}"]`);
                            discardButton.disabled = false;

                            // Create an audio element to test playback
                            const audio = new Audio(audioUrl);
                            audio.play();
                        };
                        reader.readAsDataURL(audioBlob);
                    }

                    // Stop all tracks on the stream
                    stream.getTracks().forEach(track => track.stop());
                });

                this.mediaRecorder.start();
            })
            .catch(error => {
                console.error("Error starting recording:", error);
                alert("Unable to access microphone. Please check permissions.")
                this.resetRecordingState();
            });
    }

    // Stop the current recording
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
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
        // Remove from session sound set
        if (this.tangible.sessionSoundSet && this.tangible.sessionSoundSet[letter]) {
            delete this.tangible.sessionSoundSet[letter];

            // Disable the discard button
            const discardButton = document.querySelector(`.discard-button[data-letter="${letter}"]`);
            discardButton.disabled = true;

            // Reset progress bar
            const progressBar = document.querySelector(`.progress-bar[data-letter="${letter}"]`);
            progressBar.style.width = '0%';
        }
    }

    // Save all recordings as a session sound set
    saveSessionSoundSet() {
        if (!this.tangible.sessionSoundSet || Object.keys(this.tangible.sessionSoundSet).length === 0) {
            alert("Please record at least one sound before saving.");
            return;
        }

        const soundsArray = Object.values(this.tangible.sessionSoundSet);
        const setName = "Custom_" + new Date().getTime();

        this.tangible.soundSets[setName] = [soundsArray, []];
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
}

// Initialise the sound recorder with the tangible instance
let soundRecorderInstance;

// Wait for tangible top be initialised before creating the sound recorder
const waitForTangible = setInterval(() => {
    // Check if window.tangible has been created by main.js
    if (window.tangible instanceof Tangible) {
        soundRecorderInstance = new SoundRecorder(window.tangible);
        clearInterval(waitForTangible);
    }
}, 100);

// Export the class for potential future use
export default SoundRecorder;