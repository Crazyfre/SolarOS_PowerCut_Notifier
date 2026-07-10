import math
import struct
import wave
import os

def generate_beep():
    sample_rate = 44100.0
    duration = 5.0  # seconds
    num_samples = int(sample_rate * duration)
    
    # Ensure assets directory exists
    os.makedirs('d:/SolarOS/assets', exist_ok=True)
    
    filepath = 'd:/SolarOS/assets/alarm.wav'
    print(f"Generating alert sound: {filepath}...")
    
    with wave.open(filepath, 'w') as wav_file:
        wav_file.setparams((1, 2, int(sample_rate), num_samples, 'NONE', 'not compressed'))
        
        for i in range(num_samples):
            t = i / sample_rate
            
            # Pulsing frequency: alternate between 900Hz and 1300Hz every 0.15 seconds
            pulse = math.floor(t / 0.15) % 2
            freq = 900.0 if pulse == 0 else 1300.0
            
            # Pulsing volume envelope (siren effect)
            vol_pulse = math.sin(2.0 * math.pi * 3.33 * t)  # ~3.33Hz volume pulse
            vol = 0.6 + 0.4 * vol_pulse
            
            # Generate sine wave value
            val = math.sin(2.0 * math.pi * freq * t)
            
            # Scale to 16-bit signed integer and pack
            sample = int(val * vol * 32767.0 * 0.7)
            wav_file.writeframes(struct.pack('h', sample))
            
    print("Alert sound generated successfully.")

if __name__ == '__main__':
    generate_beep()
