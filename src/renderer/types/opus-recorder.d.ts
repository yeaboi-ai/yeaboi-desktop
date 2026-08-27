declare module "opus-recorder" {
  interface RecorderConfig {
    encoderPath?: string;
    encoderSampleRate?: number;
    encoderFrameSize?: number;
    maxFramesPerPage?: number;
    numberOfChannels?: number;
    streamPages?: boolean;
    encoderComplexity?: number;
    encoderApplication?: number;
    resampleQuality?: number;
    bufferLength?: number;
    mediaTrackConstraints?: boolean | MediaTrackConstraints;
    monitorGain?: number;
    recordingGain?: number;
  }

  class Recorder {
    constructor(config?: RecorderConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    close(): void;
    pause(flush?: boolean): Promise<void>;
    resume(): void;
    ondataavailable: (data: Uint8Array) => void;
    onstart: () => void;
    onstop: () => void;
    onpause: () => void;
    onresume: () => void;
    state: string;
    static isRecordingSupported(): boolean;
  }

  export default Recorder;
}
