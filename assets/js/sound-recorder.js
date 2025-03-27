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
        
        // Create permission banner with a slight delay to ensure DOM is ready
        setTimeout(() => {
            this.createPermissionBanner();
        }, 500);
    }

    // Create a banner to request microphone permission with user interaction
    createPermissionBanner() {
        console.log("Creating permission banner");
        
        // Create banner element
        const banner = document.createElement('div');
        banner.id = 'mic-permission-banner';
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background-color: #f8d7da;
            color: #721c24;
            padding: 10px;
            text-align: center;
            z-index: 9999;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        // Create message and button
        const message = document.createElement('div');
        message.textContent = 'Microphone access is required to record sounds. Please allow access.';
        
        const button = document.createElement('button');
        button.textContent = 'Grant Access';
        button.style.cssText = `
            background-color: #28a745;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        `;
        
        const dismissButton = document.createElement('button');
        dismissButton.textContent = '×';
        dismissButton.style.cssText = `
            background: none;
            border: none;
            color: #721c24;
            font-size: 20px;
            cursor: pointer;
            margin-left: 10px;
        `;

        // Add event listeners
        button.addEventListener('click', () => {
            console.log("Grant access button clicked");
            this.requestMicrophoneAccess((granted) => {
                if (granted) {
                    banner.style.backgroundColor = '#d4edda';
                    banner.style.color = '#155724';
                    message.textContent = 'Microphone access granted. You can now record sounds.';
                    button.style.display = 'none';
                    
                    // Remove banner after 3 seconds
                    setTimeout(() => {
                        banner.remove();
                    }, 3000);
                }
            });
        });
        
        dismissButton.addEventListener('click', () => {
            banner.remove();
        });

        // Add elements to banner
        banner.appendChild(message);
        banner.appendChild(button);
        banner.appendChild(dismissButton);

        // Add banner to document
        document.body.appendChild(banner);
        console.log("Permission banner added to document");
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
                
                // Remove banner if it exists
                const banner = document.getElementById('mic-permission-banner');
                if (banner) {
                    banner.remove();
                }
                
                if (callback && typeof callback === 'function') {
                    callback(true);
                }
            })
            .catch(error => {
                console.error("Error accessing microphone:", error);
                
                // Update banner if it exists
                const banner = document.getElementById('mic-permission-banner');
                if (banner) {
                    banner.style.backgroundColor = '#f8d7da';
                    banner.style.color = '#721c24';
                    const message = banner.querySelector('div');
                    if (message) {
                        message.textContent = 'Microphone access denied. Recording will not work.';
                    }
                }
                
                if (callback && typeof callback === 'function') {
                    callback(false);
                }
            });
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
            // Initially disable all discard buttons
            button.disabled = true;
            
            button.addEventListener('click', (e) => {
                const letter = e.currentTarget.dataset.letter;
                this.discardRecording(letter);
            });
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

        // If we already have a stream, use it directly
        if (this.stream && this.stream.active) {
            this.setupMediaRecorder(this.stream);
            return;
        }

        // Otherwise request a new stream
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.stream = stream;
                this.setupMediaRecorder(stream);
            })
            .catch(error => {
                console.error("Error starting recording:", error);
                alert("Unable to access microphone. Please check permissions.");
                this.resetRecordingState();
            });
    }

    setupMediaRecorder(stream) {
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
                    
                    // Enable the discard button for this recording
                    const discardButton = document.querySelector(`.discard-button[data-letter="${this.recordingSlot}"]`);
                    discardButton.disabled = false;

                    // Create an audio element to test playback
                    const audio = new Audio(audioUrl);
                    audio.play();
                    console.log(`Recorded sound for letter ${this.recordingSlot}`);
                };
                reader.readAsDataURL(audioBlob);
            }
        });

        this.mediaRecorder.start();
        console.log("MediaRecorder started");
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
            console.log(`Removed sound for letter ${letter}`);

            // Disable the discard button
            const discardButton = document.querySelector(`.discard-button[data-letter="${letter}"]`);
            discardButton.disabled = true;

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
        console.log("Saving sounds:", soundsArray);
        
        // Make sure the correct format is used for tangible sound sets
        // The format must match what tangible.js expects
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
window.requestMicrophonePermission = function() {
    console.log("Global microphone permission request function called");
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

// Add a mic request button inside the sound set div
(function() {
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