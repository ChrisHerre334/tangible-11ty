/**
 * Unit tests for Tangible.preloads method
 * 
 * @jest-environment jsdom
 */

import Tangible from '../assets/js/tangible.js';

describe('Tangible.preloads', () => {
  let tangible;

  beforeEach(() => {
    // Setup document elements needed by preloads
    document.body.innerHTML = `
      <div id="challenges"></div>
    `;

    // Mock Audio constructor
    global.Audio = jest.fn().mockImplementation((src) => ({
      src,
      play: jest.fn().mockImplementation(() => Promise.resolve()),
      pause: jest.fn(),
      onended: null
    }));

    // Create a new Tangible instance
    tangible = new Tangible();
  });

  it('should load built-in sound sets correctly', () => {
    // Test with a built-in sound set
    tangible.preloads('GimmeGimmeGimme');

    // Check that Audio objects were created for each letter
    expect(Audio).toHaveBeenCalledWith('/tangible-11ty/assets/sound/GimmeGimmeGimme/A.mp3');
    expect(Audio).toHaveBeenCalledWith('/tangible-11ty/assets/sound/GimmeGimmeGimme/B.mp3');
    expect(Audio).toHaveBeenCalledWith('/tangible-11ty/assets/sound/GimmeGimmeGimme/C.mp3');
    expect(Audio).toHaveBeenCalledWith('/tangible-11ty/assets/sound/GimmeGimmeGimme/D.mp3');

    // Verify sounds object structure
    expect(Object.keys(tangible.sounds)).toEqual(['A', 'B', 'C', 'D']);

    // Verify challenges HTML was updated
    const challengesDiv = document.getElementById('challenges');
    expect(challengesDiv.innerHTML).toContain('<h3>Challenge 1</h3>');
    expect(challengesDiv.innerHTML).toContain('<h3>Challenge 2</h3>');
    expect(challengesDiv.innerHTML).toContain('/tangible-11ty/assets/sound/GimmeGimmeGimme/challenge1.mp3');
    expect(challengesDiv.innerHTML).toContain('/tangible-11ty/assets/sound/GimmeGimmeGimme/challenge2.mp3');
  });

  it('should load custom sound sets from sessionSoundSet', () => {
    // Setup a custom sound set name
    const customSetName = 'Custom_123456';

    // Add the custom set to soundSets
    tangible.soundSets[customSetName] = [['A', 'B'], []];

    // Setup sessionSoundSet with recorded sounds
    tangible.sessionSoundSet = {
      'A': { letter: 'A', dataUrl: 'data:audio/mp3;base64,ABC123' },
      'B': { letter: 'B', dataUrl: 'data:audio/mp3;base64,DEF456' }
    };

    // Load the custom sound set
    tangible.preloads(customSetName);

    // Check that Audio objects were created with data URLs
    expect(tangible.sounds.A.src).toBe('data:audio/mp3;base64,ABC123');
    expect(tangible.sounds.B.src).toBe('data:audio/mp3;base64,DEF456');

    // Verify challenges div should be empty for custom sets
    const challengesDiv = document.getElementById('challenges');
    expect(challengesDiv.innerHTML).toBe('');
  });

  it('should handle sound sets with no challenges', () => {
    // Test with a set that has no challenges
    tangible.preloads('DoctorFoster');

    // Verify challenges div should be empty
    const challengesDiv = document.getElementById('challenges');
    expect(challengesDiv.innerHTML).toBe('');
  });

  it('should handle missing letters in custom sound sets', () => {
    // Setup a custom sound set name
    const customSetName = 'Custom_123456';

    // Add the custom set to soundSets with letters that don't all exist in sessionSoundSet
    tangible.soundSets[customSetName] = [['A', 'B', 'C'], []];

    // Setup sessionSoundSet with only some recorded sounds
    tangible.sessionSoundSet = {
      'A': { letter: 'A', dataUrl: 'data:audio/mp3;base64,ABC123' }
      // B and C are missing
    };

    // Load the custom sound set
    tangible.preloads(customSetName);

    // Check that only existing letters were created
    expect(tangible.sounds.A).toBeDefined();
    expect(tangible.sounds.B).toBeUndefined();
    expect(tangible.sounds.C).toBeUndefined();
  });

  it('should handle null or undefined sessionSoundSet for custom sets', () => {
    // Setup a custom sound set name
    const customSetName = 'Custom_123456';

    // Add the custom set to soundSets
    tangible.soundSets[customSetName] = [['A', 'B'], []];

    // Ensure sessionSoundSet is null
    tangible.sessionSoundSet = null;

    // This should not throw an error
    expect(() => {
      tangible.preloads(customSetName);
    }).not.toThrow();

    // No sounds should be created
    expect(Object.keys(tangible.sounds).length).toBe(0);
  });
});