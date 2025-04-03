/**
 * Unit tests for SoundRecorder class
 * 
 * @jest-environment jsdom
 */

import SoundRecorder from '../assets/js/sound-recorder.js';
import Tangible from '../assets/js/tangible.js';

// Mock browser APIs
global.MediaRecorder = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  addEventListener: jest.fn(),
  state: 'inactive'
}));

global.URL = {
  createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
};

global.Audio = jest.fn().mockImplementation(() => ({
  play: jest.fn().mockImplementation(() => Promise.resolve()),
  pause: jest.fn(),
  onended: null
}));

global.FileReader = jest.fn().mockImplementation(() => ({
  readAsDataURL: jest.fn(),
  onloadend: null,
  result: 'data:audio/test'
}));

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn()
  },
  writable: true
});

describe('SoundRecorder', () => {
  let soundRecorder;
  let mockTangible;
  let mockMediaStream;

  beforeEach(() => {
    // Reset DOM for each test
    document.body.innerHTML = `
      <div>
        <button class="record-button" data-letter="A"></button>
        <button class="record-button" data-letter="B"></button>
        <div class="progress-bar" data-letter="A"></div>
        <button class="discard-button" data-letter="A"></button>
        <button class="discard-button" data-letter="B"></button>
        <div id="submit-sound-set"></div>
      </div>
    `;

    // Mock MediaStream
    mockMediaStream = {
      active: true,
      getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }])
    };

    // Reset navigator.mediaDevices.getUserMedia to resolve with mock stream
    navigator.mediaDevices.getUserMedia = jest.fn().mockResolvedValue(mockMediaStream);

    // Create a mock Tangible instance
    mockTangible = new Tangible();

    // Create a new SoundRecorder instance
    soundRecorder = new SoundRecorder(mockTangible);

    // Reset mocks
    jest.clearAllMocks();

    // Mock the Date object
    jest.spyOn(global.Date, 'now').mockReturnValue(1000);

    // Mock setTimeout
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Restore Date.now and setTimeout
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(soundRecorder.tangible).toBe(mockTangible);
      expect(soundRecorder.mediaRecorder).toBeNull();
      expect(soundRecorder.audioChunks).toEqual([]);
      expect(soundRecorder.recordingSlot).toBeNull();
      expect(soundRecorder.maxRecordingTime).toBe(5);
      expect(soundRecorder.recordingInterval).toBeNull();
      expect(soundRecorder.recordingStartTime).toBeNull();
      expect(soundRecorder.stream).toBeNull();
      expect(soundRecorder.hasRequestedPermission).toBe(false);
    });

    it('should call initEventListeners', () => {
      const spy = jest.spyOn(SoundRecorder.prototype, 'initEventListeners');
      new SoundRecorder(mockTangible);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('requestMicrophoneAccess', () => {
    it('should set hasRequestedPermission flag to true', () => {
      soundRecorder.requestMicrophoneAccess();
      expect(soundRecorder.hasRequestedPermission).toBe(true);
    });

    it('should call getUserMedia with audio option', () => {
      soundRecorder.requestMicrophoneAccess();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('should set stream and call showPermissionFeedback on success', async () => {
      const showPermissionSpy = jest.spyOn(soundRecorder, 'showPermissionFeedback');
      const callback = jest.fn();

      await soundRecorder.requestMicrophoneAccess(callback);

      expect(soundRecorder.stream).toBe(mockMediaStream);
      expect(showPermissionSpy).toHaveBeenCalledWith(true);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should call showPermissionFeedback with false and call callback on error', async () => {
      navigator.mediaDevices.getUserMedia = jest.fn().mockRejectedValue(new Error('Permission denied'));

      const showPermissionSpy = jest.spyOn(soundRecorder, 'showPermissionFeedback');
      const callback = jest.fn();

      await soundRecorder.requestMicrophoneAccess(callback).catch(() => { });

      expect(showPermissionSpy).toHaveBeenCalledWith(false);
      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  describe('showPermissionFeedback', () => {
    it('should create and append feedback element for granted permission', () => {
      soundRecorder.showPermissionFeedback(true);

      const feedback = document.body.querySelector('div:last-child');
      expect(feedback).not.toBeNull();
      expect(feedback.textContent).toBe('✓ Microphone access granted');
      expect(feedback.style.backgroundColor).toBe('#28a745');

      // Fast-forward to verify removal
      jest.advanceTimersByTime(3000);
      expect(document.body.contains(feedback)).toBe(false);
    });

    it('should create and append feedback element for denied permission', () => {
      soundRecorder.showPermissionFeedback(false);

      const feedback = document.body.querySelector('div:last-child');
      expect(feedback).not.toBeNull();
      expect(feedback.textContent).toBe('❌ Microphone access denied');
      expect(feedback.style.backgroundColor).toBe('#dc3545');

      // Fast-forward to verify removal
      jest.advanceTimersByTime(3000);
      expect(document.body.contains(feedback)).toBe(false);
    });
  });

  describe('initEventListeners', () => {
    it('should add click listeners to record buttons', () => {
      const buttons = document.querySelectorAll('.record-button');
      const spy = jest.spyOn(soundRecorder, 'handleRecordButtonClick');

      // Manually trigger the click event
      buttons[0].click();

      expect(spy).toHaveBeenCalledWith('A', buttons[0]);
    });

    it('should add click listeners to discard buttons', () => {
      const buttons = document.querySelectorAll('.discard-button');
      const spy = jest.spyOn(soundRecorder, 'discardRecording');

      // Enable the button first since it's disabled by default
      buttons[0].disabled = false;
      buttons[0].click();

      expect(spy).toHaveBeenCalledWith('A');
    });

    it('should add click listener to submit button', () => {
      const submitButton = document.getElementById('submit-sound-set');
      const spy = jest.spyOn(soundRecorder, 'saveSessionSoundSet');

      submitButton.click();

      expect(spy).toHaveBeenCalled();
    });

    it('should enable discard buttons for existing recordings', () => {
      // Setup existing recordings
      mockTangible.sessionSoundSet = {
        'A': { letter: 'A', dataUrl: 'data:audio/test' }
      };

      // Reinitialize event listeners
      soundRecorder.initEventListeners();

      const discardButtonA = document.querySelector('.discard-button[data-letter="A"]');
      expect(discardButtonA.disabled).toBe(false);

      const discardButtonB = document.querySelector('.discard-button[data-letter="B"]');
      expect(discardButtonB.disabled).toBe(true);
    });
  });

  describe('handleRecordButtonClick', () => {
    it('should stop recording if already recording this slot', () => {
      soundRecorder.recordingSlot = 'A';
      const stopSpy = jest.spyOn(soundRecorder, 'stopRecording');

      soundRecorder.handleRecordButtonClick('A', document.querySelector('.record-button[data-letter="A"]'));

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should use existing stream if active', () => {
      soundRecorder.stream = mockMediaStream;
      const toggleSpy = jest.spyOn(soundRecorder, 'toggleRecording');

      soundRecorder.handleRecordButtonClick('A', document.querySelector('.record-button[data-letter="A"]'));

      expect(toggleSpy).toHaveBeenCalledWith('A', expect.any(Element));
    });

    it('should request mic access if no stream exists', () => {
      const requestSpy = jest.spyOn(soundRecorder, 'requestMicrophoneAccess');

      soundRecorder.handleRecordButtonClick('A', document.querySelector('.record-button[data-letter="A"]'));

      expect(requestSpy).toHaveBeenCalled();
      // Verify the callback is a function
      expect(typeof requestSpy.mock.calls[0][0]).toBe('function');
    });
  });

  describe('toggleRecording', () => {
    let button, progressBar;

    beforeEach(() => {
      button = document.querySelector('.record-button[data-letter="A"]');
      progressBar = document.querySelector('.progress-bar[data-letter="A"]');

      // Spy on other methods
      jest.spyOn(soundRecorder, 'stopRecording');
      jest.spyOn(soundRecorder, 'startRecording');
    });

    it('should stop recording if recording another slot', () => {
      soundRecorder.recordingSlot = 'B';

      soundRecorder.toggleRecording('A', button);

      expect(soundRecorder.stopRecording).toHaveBeenCalled();
    });

    it('should set recordingSlot and add recording class', () => {
      soundRecorder.toggleRecording('A', button);

      expect(soundRecorder.recordingSlot).toBe('A');
      expect(button.classList.contains('recording')).toBe(true);
    });

    it('should reset progress bar', () => {
      soundRecorder.toggleRecording('A', button);

      expect(progressBar.style.width).toBe('0%');
    });

    it('should call startRecording', () => {
      soundRecorder.toggleRecording('A', button);

      expect(soundRecorder.startRecording).toHaveBeenCalledWith('A');
    });

    it('should set up recording timer and interval', () => {
      soundRecorder.toggleRecording('A', button);

      expect(soundRecorder.recordingStartTime).toBe(1000); // mocked Date.now value
      expect(soundRecorder.recordingInterval).not.toBeNull();

      // Advance time to simulate progress
      jest.spyOn(global.Date, 'now').mockReturnValue(2000); // 1 second elapsed
      jest.advanceTimersByTime(100); // Trigger interval

      expect(progressBar.style.width).toBe('20%'); // 1s / 5s * 100

      // Advance to completion
      jest.spyOn(global.Date, 'now').mockReturnValue(6000); // 5 seconds elapsed
      jest.advanceTimersByTime(100); // Trigger interval

      expect(soundRecorder.stopRecording).toHaveBeenCalledWith('A');
    });
  });

  describe('startRecording', () => {
    it('should reset audioChunks', () => {
      soundRecorder.audioChunks = ['old chunk'];
      soundRecorder.startRecording('A');
      expect(soundRecorder.audioChunks).toEqual([]);
    });

    it('should use existing stream if active', () => {
      soundRecorder.stream = mockMediaStream;
      const setupSpy = jest.spyOn(soundRecorder, 'setupMediaRecorder');

      soundRecorder.startRecording('A');

      expect(setupSpy).toHaveBeenCalledWith(mockMediaStream, 'A');
    });

    it('should request new stream if none exists', async () => {
      soundRecorder.stream = null;
      const setupSpy = jest.spyOn(soundRecorder, 'setupMediaRecorder');

      await soundRecorder.startRecording('A');

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(setupSpy).toHaveBeenCalledWith(mockMediaStream, 'A');
    });

    it('should handle errors when requesting stream', async () => {
      soundRecorder.stream = null;
      navigator.mediaDevices.getUserMedia = jest.fn().mockRejectedValue(new Error('Permission denied'));

      const resetSpy = jest.spyOn(soundRecorder, 'resetRecordingState');
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => { });

      await soundRecorder.startRecording('A').catch(() => { });

      expect(alertSpy).toHaveBeenCalledWith('Unable to access microphone. Please check permissions.');
      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe('setupMediaRecorder', () => {
    beforeEach(() => {
      // Create a mock MediaRecorder instance
      soundRecorder.mediaRecorder = new MediaRecorder();
    });

    it('should create a new MediaRecorder instance', () => {
      soundRecorder.setupMediaRecorder(mockMediaStream, 'A');

      expect(MediaRecorder).toHaveBeenCalledWith(mockMediaStream);
      expect(soundRecorder.mediaRecorder._recordingSlot).toBe('A');
    });

    it('should add event listeners for dataavailable and stop', () => {
      soundRecorder.setupMediaRecorder(mockMediaStream, 'A');

      expect(soundRecorder.mediaRecorder.addEventListener).toHaveBeenCalledTimes(2);
      expect(soundRecorder.mediaRecorder.addEventListener.mock.calls[0][0]).toBe('dataavailable');
      expect(soundRecorder.mediaRecorder.addEventListener.mock.calls[1][0]).toBe('stop');
    });

    it('should start the MediaRecorder', () => {
      soundRecorder.setupMediaRecorder(mockMediaStream, 'A');

      expect(soundRecorder.mediaRecorder.start).toHaveBeenCalled();
    });

    it('should handle dataavailable event', () => {
      soundRecorder.setupMediaRecorder(mockMediaStream, 'A');

      // Get the dataavailable event handler
      const dataHandler = soundRecorder.mediaRecorder.addEventListener.mock.calls[0][1];

      // Simulate data event
      dataHandler({ data: 'audio-chunk' });

      expect(soundRecorder.audioChunks).toEqual(['audio-chunk']);
    });

    it('should handle stop event and process recording', () => {
      // Mock the existing objects needed for this test
      global.Blob = jest.fn().mockImplementation(() => ({}));

      soundRecorder.setupMediaRecorder(mockMediaStream, 'A');
      soundRecorder.audioChunks = ['chunk1', 'chunk2'];

      // Get the stop event handler
      const stopHandler = soundRecorder.mediaRecorder.addEventListener.mock.calls[1][1];

      // Simulate stop event
      stopHandler();

      // Verify blob creation
      expect(Blob).toHaveBeenCalledWith(['chunk1', 'chunk2'], { type: 'audio/webm' });

      // Verify discard button is enabled
      const discardButton = document.querySelector('.discard-button[data-letter="A"]');
      expect(discardButton.disabled).toBe(false);

      // Simulate FileReader onloadend
      const reader = FileReader.mock.instances[0];
      reader.onloadend();

      // Verify audio element creation and playback
      expect(Audio).toHaveBeenCalledWith('blob:test-url');
      expect(Audio.mock.instances[0].play).toHaveBeenCalled();

      // Verify session sound set update
      expect(mockTangible.sessionSoundSet).toHaveProperty('A');
      expect(mockTangible.sessionSoundSet.A).toEqual({
        letter: 'A',
        dataUrl: 'data:audio/test'
      });
    });
  });

  describe('stopRecording', () => {
    it('should stop mediaRecorder if active', () => {
      soundRecorder.recordingSlot = 'A';
      soundRecorder.mediaRecorder = {
        state: 'recording',
        stop: jest.fn(),
        _recordingSlot: null
      };

      soundRecorder.stopRecording();

      expect(soundRecorder.mediaRecorder._recordingSlot).toBe('A');
      expect(soundRecorder.mediaRecorder.stop).toHaveBeenCalled();
    });

    it('should use provided letter if specified', () => {
      soundRecorder.recordingSlot = 'A';
      soundRecorder.mediaRecorder = {
        state: 'recording',
        stop: jest.fn(),
        _recordingSlot: null
      };

      soundRecorder.stopRecording('B');

      expect(soundRecorder.mediaRecorder._recordingSlot).toBe('B');
    });

    it('should call resetRecordingState', () => {
      const resetSpy = jest.spyOn(soundRecorder, 'resetRecordingState');

      soundRecorder.stopRecording('A');

      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe('resetRecordingState', () => {
    it('should remove recording class from button', () => {
      const button = document.querySelector('.record-button[data-letter="A"]');
      button.classList.add('recording');
      soundRecorder.recordingSlot = 'A';

      soundRecorder.resetRecordingState();

      expect(button.classList.contains('recording')).toBe(false);
    });

    it('should clear recording slot', () => {
      soundRecorder.recordingSlot = 'A';

      soundRecorder.resetRecordingState();

      expect(soundRecorder.recordingSlot).toBeNull();
    });

    it('should clear recording interval', () => {
      const mockInterval = 123;
      soundRecorder.recordingInterval = mockInterval;
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      soundRecorder.resetRecordingState();

      expect(clearIntervalSpy).toHaveBeenCalledWith(mockInterval);
      expect(soundRecorder.recordingInterval).toBeNull();
    });
  });

  describe('discardRecording', () => {
    beforeEach(() => {
      // Setup existing recording
      mockTangible.sessionSoundSet = {
        'A': { letter: 'A', dataUrl: 'data:audio/test' }
      };

      // Set up progress bar
      const progressBar = document.querySelector('.progress-bar[data-letter="A"]');
      progressBar.style.width = '50%';

      // Enable discard button
      const discardButton = document.querySelector('.discard-button[data-letter="A"]');
      discardButton.disabled = false;
    });

    it('should remove recording from session sound set', () => {
      soundRecorder.discardRecording('A');

      expect(mockTangible.sessionSoundSet).not.toHaveProperty('A');
    });

    it('should reset progress bar', () => {
      soundRecorder.discardRecording('A');

      const progressBar = document.querySelector('.progress-bar[data-letter="A"]');
      expect(progressBar.style.width).toBe('0%');
    });

    it('should disable discard button', () => {
      soundRecorder.discardRecording('A');

      const discardButton = document.querySelector('.discard-button[data-letter="A"]');
      expect(discardButton.disabled).toBe(true);
    });
  });

  describe('saveSessionSoundSet', () => {
    beforeEach(() => {
      // Mock alert
      global.alert = jest.fn();

      // Spy on methods
      jest.spyOn(soundRecorder, 'updateSoundSetDropdown');
    });

    it('should show alert if no sounds recorded', () => {
      mockTangible.sessionSoundSet = null;

      soundRecorder.saveSessionSoundSet();

      expect(alert).toHaveBeenCalledWith('Please record at least one sound before saving.');
      expect(soundRecorder.updateSoundSetDropdown).not.toHaveBeenCalled();
    });

    it('should create custom sound set with timestamp name', () => {
      mockTangible.sessionSoundSet = {
        'A': { letter: 'A', dataUrl: 'data:audio/test' },
        'B': { letter: 'B', dataUrl: 'data:audio/test' }
      };

      // Mock Date constructor
      const mockDate = new Date(1000);
      global.Date = jest.fn(() => mockDate);
      mockDate.getTime = jest.fn().mockReturnValue(1000);

      soundRecorder.saveSessionSoundSet();

      // Verify sound set creation
      expect(mockTangible.soundSets).toHaveProperty('Custom_1000');
      expect(mockTangible.soundSets['Custom_1000']).toEqual([['A', 'B'], []]);

      // Verify methods called
      expect(soundRecorder.updateSoundSetDropdown).toHaveBeenCalledWith('Custom_1000');
      expect(mockTangible.preloads).toHaveBeenCalledWith('Custom_1000');
      expect(alert).toHaveBeenCalledWith('Your custom sound set has been saved and is now active!');
    });
  });

  describe('updateSoundSetDropdown', () => {
    beforeEach(() => {
      // Create dropdown
      document.body.innerHTML = '<select id="soundSets"></select>';
    });

    it('should add new option to dropdown', () => {
      soundRecorder.updateSoundSetDropdown('Custom_1000');

      const dropdown = document.getElementById('soundSets');
      const option = dropdown.querySelector('option');

      expect(option).not.toBeNull();
      expect(option.value).toBe('Custom_1000');
      expect(option.textContent).toBe('My Custom Set');
      expect(option.selected).toBe(true);
    });

    it('should do nothing if dropdown not found', () => {
      document.body.innerHTML = '';

      // This should not throw an error
      soundRecorder.updateSoundSetDropdown('Custom_1000');
    });
  });

  describe('cleanup', () => {
    it('should stop mediaRecorder if active', () => {
      soundRecorder.mediaRecorder = {
        state: 'recording',
        stop: jest.fn()
      };

      soundRecorder.cleanup();

      expect(soundRecorder.mediaRecorder.stop).toHaveBeenCalled();
    });

    it('should stop and release media stream tracks', () => {
      const mockTrack = { stop: jest.fn() };
      soundRecorder.stream = {
        getTracks: jest.fn().mockReturnValue([mockTrack, mockTrack])
      };

      soundRecorder.cleanup();

      expect(soundRecorder.stream.getTracks).toHaveBeenCalled();
      expect(mockTrack.stop).toHaveBeenCalledTimes(2);
      expect(soundRecorder.stream).toBeNull();
    });

    it('should clear recording interval', () => {
      const mockInterval = 123;
      soundRecorder.recordingInterval = mockInterval;
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      soundRecorder.cleanup();

      expect(clearIntervalSpy).toHaveBeenCalledWith(mockInterval);
      expect(soundRecorder.recordingInterval).toBeNull();
    });
  });
});

// Tests for the global functions
describe('Global functions', () => {
  let originalConsole;

  beforeEach(() => {
    // Save original console
    originalConsole = global.console;

    // Mock console
    global.console = {
      log: jest.fn(),
      error: jest.fn()
    };

    // Setup DOM for requestMicrophonePermission function
    document.body.innerHTML = '';

    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockResolvedValue({ active: true })
      },
      writable: true
    });

    // Set up window for global function
    global.window = {
      requestMicrophonePermission: null,
      _micStream: null
    };
  });

  afterEach(() => {
    // Restore console
    global.console = originalConsole;

    // Clean up timers
    jest.useRealTimers();
  });

  describe('requestMicrophonePermission', () => {
    it('should call SoundRecorder instance if available', () => {
      // Create mock soundRecorderInstance
      global.soundRecorderInstance = {
        requestMicrophoneAccess: jest.fn()
      };

      // Setup the global function
      // Need to re-import the function
      jest.isolateModules(() => {
        require('../assets/js/sound-recorder.js');
      });

      // Call the global function
      window.requestMicrophonePermission();

      expect(global.soundRecorderInstance.requestMicrophoneAccess).toHaveBeenCalled();
    });

    it('should request permission directly if no instance available', async () => {
      // Reset soundRecorderInstance
      global.soundRecorderInstance = null;

      // Setup the global function
      jest.isolateModules(() => {
        require('../assets/js/sound-recorder.js');
      });

      // Mock document.createElement
      const mockElement = {
        style: {},
        remove: jest.fn()
      };
      document.createElement = jest.fn().mockReturnValue(mockElement);
      document.body.appendChild = jest.fn();

      // Mock setTimeout
      jest.useFakeTimers();

      // Call the global function
      await window.requestMicrophonePermission();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(mockElement.textContent).toBe('✓ Microphone access granted');
      expect(document.body.appendChild).toHaveBeenCalledWith(mockElement);

      // Advance timers to trigger the removal
      jest.advanceTimersByTime(3000);
      expect(mockElement.remove).toHaveBeenCalled();
    });

    it('should show error feedback if permission denied', async () => {
      // Reset soundRecorderInstance
      global.soundRecorderInstance = null;

      // Reject the permission request
      navigator.mediaDevices.getUserMedia = jest.fn().mockRejectedValue(new Error('Permission denied'));

      // Setup the global function
      jest.isolateModules(() => {
        require('../assets/js/sound-recorder.js');
      });

      // Mock document.createElement
      const mockElement = {
        style: {},
        remove: jest.fn()
      };
      document.createElement = jest.fn().mockReturnValue(mockElement);
      document.body.appendChild = jest.fn();

      // Mock setTimeout
      jest.useFakeTimers();

      // Call the global function
      await window.requestMicrophonePermission().catch(() => { });

      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(mockElement.textContent).toBe('❌ Microphone access denied');
      expect(document.body.appendChild).toHaveBeenCalledWith(mockElement);

      // Advance timers to trigger the removal
      jest.advanceTimersByTime(3000);
      expect(mockElement.remove).toHaveBeenCalled();
    });
  });

  describe('Mic permission button', () => {
    it('should add button to sound set container when ready', () => {
      // Mock document elements
      document.getElementById = jest.fn().mockImplementation((id) => {
        if (id === 'custom-sound-set-container') {
          return {
            querySelector: jest.fn().mockReturnValue({
              nextSibling: 'next-element'
            }),
            insertBefore: jest.fn(),
            appendChild: jest.fn()
          };
        }
        return null;
      });

      // Mock createElement
      const mockButton = {
        id: '',
        textContent: '',
        className: '',
        style: {},
        addEventListener: jest.fn()
      };
      document.createElement = jest.fn().mockReturnValue(mockButton);

      // Mock document ready state
      document.readyState = 'complete';

      // Setup the IIFE
      jest.isolateModules(() => {
        require('../assets/js/sound-recorder.js');
      });

      // Fast-forward setTimeout
      jest.advanceTimersByTime(200);

      // Verify button creation
      expect(document.createElement).toHaveBeenCalledWith('button');
      expect(mockButton.id).toBe('mic-permission-request-button');
      expect(mockButton.textContent).toBe('Allow Microphone');
      expect(mockButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

      // Verify button insertion
      const container = document.getElementById('custom-sound-set-container');
      expect(container.insertBefore).toHaveBeenCalledWith(mockButton, 'next-element');
    });
  });

  describe('waitForTangible', () => {
    it('should initialize SoundRecorder when tangible is ready', () => {
      // Mock setInterval and clearInterval
      const originalSetInterval = global.setInterval;
      const originalClearInterval = global.clearInterval;

      const mockIntervalId = 12345;
      global.setInterval = jest.fn().mockReturnValue(mockIntervalId);
      global.clearInterval = jest.fn();

      // Reset window.tangible
      window.tangible = null;

      // Setup the initialization code
      jest.isolateModules(() => {
        require('../assets/js/sound-recorder.js');
      });

      // Verify setInterval was called
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 100);

      // Get the interval callback
      const intervalCallback = setInterval.mock.calls[0][0];

      // First call with tangible not ready
      intervalCallback();
      expect(clearInterval).not.toHaveBeenCalled();

      // Set tangible to ready
      window.tangible = new Tangible();

      // Second call should initialize SoundRecorder
      intervalCallback();
      expect(clearInterval).toHaveBeenCalledWith(mockIntervalId);
      expect(window.soundRecorderInstance).toBeInstanceOf(SoundRecorder);

      // Restore original functions
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });
  });

  describe('BeforeUnload event', () => {
    it('should call cleanup when page unloads', () => {
      // Mock window.addEventListener
      const addEventListener = jest.spyOn(window, 'addEventListener');

      // Reset the module
      jest.isolateModules(() => {
        require('../assets/js/sound-recorder.js');
      });

      // Verify event listener was added
      expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

      // Get the event handler
      const handler = addEventListener.mock.calls[0][1];

      // Setup soundRecorderInstance
      global.soundRecorderInstance = {
        cleanup: jest.fn()
      };

      // Simulate beforeunload event
      handler();

      // Verify cleanup was called
      expect(global.soundRecorderInstance.cleanup).toHaveBeenCalled();
    });
  });
});