// Mock browser globals

// Mock window
global.window = {
  addEventListener: jest.fn(),
  tangible: null,
  fs: {
    readFile: jest.fn().mockImplementation((path, options) => {
      if (options && options.encoding === 'utf8') {
        return Promise.resolve('mock file content');
      }
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    })
  },
  requestMicrophonePermission: null,
  _micStream: null
};

// Mock navigator
global.navigator = {
  mediaDevices: {
    getUserMedia: jest.fn().mockImplementation((constraints) => {
      if (constraints.audio) {
        return Promise.resolve({
          active: true,
          getTracks: () => [{
            stop: jest.fn()
          }]
        });
      }
      return Promise.reject(new Error('No audio constraint provided'));
    })
  }
};

// Mock URL object
global.URL = {
  createObjectURL: jest.fn().mockReturnValue('blob:fake-url')
};

// Mock MediaRecorder
global.MediaRecorder = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  addEventListener: jest.fn(),
  state: 'inactive'
}));

// Mock Audio
global.Audio = jest.fn().mockImplementation((src) => ({
  src,
  play: jest.fn().mockImplementation(() => Promise.resolve()),
  pause: jest.fn(),
  onended: null,
  duration: 2
}));

// Mock FileReader
global.FileReader = jest.fn().mockImplementation(() => ({
  readAsDataURL: jest.fn(function (blob) {
    setTimeout(() => {
      this.result = 'data:audio/test;base64,mockdata';
      if (this.onloadend) this.onloadend();
    }, 0);
  }),
  onloadend: null,
  result: null
}));

// Mock Document methods that aren't in jsdom
if (typeof document.querySelector('.selector') === 'undefined') {
  document.querySelector = jest.fn().mockImplementation((selector) => {
    if (selector.includes('recording')) {
      return { classList: { add: jest.fn(), remove: jest.fn() } };
    }
    return null;
  });
}

// Mock Blob
global.Blob = jest.fn().mockImplementation(() => ({}));

// Mock setTimeout and clearTimeout
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
global.setTimeout = jest.fn().mockImplementation((cb, ms) => {
  return originalSetTimeout(cb, 0); // Execute immediately for tests
});
global.clearTimeout = jest.fn();

// Restore timers after tests
afterAll(() => {
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
});

// Silence console errors during tests
console.error = jest.fn();