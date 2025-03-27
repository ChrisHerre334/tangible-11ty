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

        // Initialise when DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            this.initEventListeners();
            // Request audio permission when the page loads
            this.checkMicrophonePermission();
        });
    }

    // Check if microphone is already allowed
    checkMicrophonePermission() {
        console.log("Checking microphone permission status...");

        // Check if the API is available
        if (navigator.permissions && navigator.permission.query) {
            navigator.permission.query({ name: 'microphone' })
                .then(permissionStatus => {
                    console.log("Microphone permission status:", permissionStatus.state);
                    // Listen for changes to permission status
                    permissionStatus.onchange = () => {
                        console.log("Permission state changed to:", permissionStatus.state);
                    };
                    // If not granted, wait for user to click record
                    if(permissionStatus.state === 'granted') {
                        console.log("Microphone permission already granted")
                    }
                })
                .catch(error => {
                    console.error("Error checking permission:", error);
                });
        } else {
            console.log("Permissions API not available, will request on record click");
        }
    }

    // Ask for microphone access and do a callback if allowed
    requestMicrophoneAccess(callback) {
        console.log("Requesting microphone access...");
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                console.log("Microphone access granted!");
                stream.getTracks().forEach(track => track.stop());
                if (callback && typeof callback === 'function') {
                    callback(true);
                }
            })
            .catch(error => {
                console.error("Error accessing microphone:", error);
                alert("You need to allow microphone access to record sounds.");
                if (callback && typeof callback === 'function') {
                    callback(false);
                }
            });
    }

    // Initialise event listeners for the custom sound set UI
    initEventListeners() {
        // Record buttons
        const recordButtons = document.querySelectorAll('.record-button');
        recordButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const letter = e.currentTarget.dataset.letter;
                this.handleRecordButtonClick(letter, e.currentTarget);
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

        // Add debug button to test microphon
        if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')) {
            const testButton = document.createElement('button');
            testButton.textContent = "TestMic";
            testButton.classList.add('duo');
            testButton.style.margin = "10px";
            testButton.addEventListener('click', () => this.requestMicrophoneAccess());
            document.getElementById('custom-sound-set-container').appendChild(testButton);
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

        // Check for mic permission, request otherwise
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({name: 'microphone'})
                .then(permissionStatus => {
                    if (permissionStatus.state === 'granted') {
                        this.toggleRecording(letter, button);
                    } else {
                        this.requestMicrophoneAccess(() => {
                            this.toggleRecording(letter, button);
                        });
                    }
                })
                .catch(error => {
                    console.error("Error checking permission:", error);
                    // Fallback to direct request
                    this.requestMicrophoneAccess(() => {
                        this.toggleRecording(letter, button);
                    });
                });
        } else {
            // Fallback for browsers without permissions API
            this.requestMicrophoneAccess((granted) => {
                if (granted) {
                    this.toggleRecording(letter, button);
                }
            });
        }
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

        this.startRecording();

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
                this.stopRecording();
            }
        }, 100);
    }

    startRecording() {
        console.log("Starting recording...");
        this.audioChunks = [];

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                console.log("Got audio stream, creating recorder");
                this.mediaRecorder = new MediaRecorder(stream);

                this.mediaRecorder.addEventListener('dataavailable', event => {
                    console.log("Received audio data chunk");
                    this.audioChunks.push(event.data);
                });

                this.mediaRecorder.addEventListener('stop', () => {
                    console.log("Recording stopped, processing audio");
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    const audioUrl = URL.createObjectURL(audioBlob);

                    if (this.recordingSlot) {
                        // Save the audio for this slot
                        if (!this.tangible.sessionSoundSet) {
                            this.tangible.sessionSoundSet = {};
                        }

                        // Convert blob to data URL for storage
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            console.log("Audio converted to data URL");
                            this.tangible.sessionSoundSet[this.recordingSlot] = {
                                letter: this.recordingSlot,
                                dataUrl: reader.result
                            };

                            // Enable the discard button
                            const discardButton = document.querySelector(`.discard-button[data-letter="${this.recordingSlot}"]`);
                            if (discardButton) {
                                discardButton.disabled = false;
                            }

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
                console.log("MediaRecorder started");
            })
            .catch(error => {
                console.error("Error starting recording:", error);
                alert("Unable to access microphone. Please check permissions.");
                this.resetRecordingState();
            });
    }

    // Stop the current recording
    stopRecording() {
        console.log("Stopping recording...");
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            console.log("MediaRecorder stopped");
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

            // Disable the discard button
            const discardButton = document.querySelector(`.discard-button[data-letter="${letter}"]`);
            if (discardButton) {
                discardButton.disabled = true;
            }

            // Reset progress bar
            const progressBar = document.querySelector(`.progress-bar[data-letter="${letter}"]`);
            if (progressBar) {
                progressBar.style.width = '0%';
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
        console.log("Tangible instance found, initializing SoundRecorder");
        soundRecorderInstance = new SoundRecorder(window.tangible);
        clearInterval(waitForTangible);
    }
}, 100);

// Export the class for potential future use
export default SoundRecorder;