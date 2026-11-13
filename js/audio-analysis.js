(function (global) {
    'use strict';

    const FFT_SIZE = 4096;
    const LOW_HZ = 40;
    const HIGH_HZ = 8000;
    const BAND_COUNT = 46;
    const MIN_POWER = 1e-12;
    const bands = Array.from({ length: BAND_COUNT }, (_, index) => {
        const startHz = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (index / BAND_COUNT);
        const endHz = LOW_HZ * (HIGH_HZ / LOW_HZ) ** ((index + 1) / BAND_COUNT);
        return { endHz, frequencyHz: Math.round(Math.sqrt(startHz * endHz)) };
    });

    const hannWindow = Float64Array.from({ length: FFT_SIZE }, (_, index) =>
        0.5 * (1 - Math.cos(2 * Math.PI * index / (FFT_SIZE - 1)))
    );
    const windowPower = hannWindow.reduce((sum, value) => sum + value ** 2, 0);
    const twiddleReal = Float64Array.from({ length: FFT_SIZE / 2 }, (_, index) =>
        Math.cos(-2 * Math.PI * index / FFT_SIZE)
    );
    const twiddleImaginary = Float64Array.from({ length: FFT_SIZE / 2 }, (_, index) =>
        Math.sin(-2 * Math.PI * index / FFT_SIZE)
    );
    const reversedIndices = new Uint16Array(FFT_SIZE);
    for (let index = 1; index < FFT_SIZE; index++) {
        reversedIndices[index] = (reversedIndices[index >> 1] >> 1) | ((index & 1) * FFT_SIZE / 2);
    }

    // AudioWorklet collects PCM without sending the microphone signal to the speakers.
    const pcmProcessor = `
        class MachineSoundCapture extends AudioWorkletProcessor {
            constructor() {
                super();
                this.chunk = new Float32Array(2048);
                this.offset = 0;
            }

            process(inputs) {
                const input = inputs[0][0];
                if (!input) return true;

                let read = 0;
                while (read < input.length) {
                    const count = Math.min(input.length - read, this.chunk.length - this.offset);
                    this.chunk.set(input.subarray(read, read + count), this.offset);
                    this.offset += count;
                    read += count;
                    if (this.offset === this.chunk.length) {
                        this.port.postMessage(this.chunk, [this.chunk.buffer]);
                        this.chunk = new Float32Array(2048);
                        this.offset = 0;
                    }
                }
                return true;
            }
        }

        registerProcessor('machine-sound-capture', MachineSoundCapture);
    `;

    function abortError() {
        return new DOMException('가동음 측정을 취소했습니다.', 'AbortError');
    }

    function waitFor(promise, signal, timeoutMs, timeoutMessage) {
        return new Promise((resolve, reject) => {
            const cancel = () => finish(reject, abortError());
            const timeout = timeoutMs && setTimeout(() => finish(reject, new Error(timeoutMessage)), timeoutMs);

            function finish(callback, value) {
                clearTimeout(timeout);
                signal?.removeEventListener('abort', cancel);
                callback(value);
            }

            promise.then(value => finish(resolve, value), error => finish(reject, error));
            if (signal?.aborted) cancel();
            else signal?.addEventListener('abort', cancel, { once: true });
        });
    }

    function prepareCapture() {
        const AudioContext = global.AudioContext || global.webkitAudioContext;
        if (!global.isSecureContext || !global.navigator?.mediaDevices?.getUserMedia ||
            !AudioContext || !global.AudioWorkletNode) return null;

        try {
            const context = new AudioContext();
            // Keep a context activated by the tap while Web NFC waits for a sticker.
            void context.resume().catch(() => {});
            return context;
        } catch {
            return null;
        }
    }

    async function capture({ durationMs = 10000, signal, onProgress, preparedContext } = {}) {
        if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 60000) {
            throw new Error('측정 시간은 1초 이상 60초 이하여야 합니다.');
        }
        if (signal?.aborted) throw abortError();
        if (!global.isSecureContext) {
            throw new Error('마이크 측정을 사용하려면 HTTPS 또는 localhost에서 앱을 열어 주세요.');
        }

        const AudioContext = global.AudioContext || global.webkitAudioContext;
        if (!global.navigator?.mediaDevices?.getUserMedia || !AudioContext || !global.AudioWorkletNode) {
            throw new Error('이 브라우저에서는 마이크 측정을 사용할 수 없습니다.');
        }

        const context = preparedContext ?? new AudioContext();
        let stream;
        let microphone;
        let recorder;
        let moduleUrl;
        let trackEnded;
        try {
            if (!context.audioWorklet) {
                throw new Error('이 브라우저에서는 가동음 분석을 사용할 수 없습니다.');
            }

            // Resume during the user's click so mobile browsers allow audio processing.
            const resumed = context.resume().then(() => true, () => false);
            const permission = global.navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                video: false
            }).then(mediaStream => {
                if (signal?.aborted) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    throw abortError();
                }
                stream = mediaStream;
            });
            await waitFor(permission, signal);

            moduleUrl = URL.createObjectURL(new Blob([pcmProcessor], { type: 'text/javascript' }));
            const [, isRunning] = await waitFor(
                Promise.all([context.audioWorklet.addModule(moduleUrl), resumed]),
                signal,
                5000,
                '마이크를 시작하지 못했습니다. 측정 버튼을 다시 눌러 주세요.'
            );
            if (!isRunning || context.state !== 'running') {
                throw new Error('마이크를 시작하지 못했습니다. 측정 버튼을 다시 눌러 주세요.');
            }

            const sampleRate = context.sampleRate;
            const samples = new Float32Array(Math.round(sampleRate * durationMs / 1000));
            let samplesWritten = 0;
            microphone = context.createMediaStreamSource(stream);
            recorder = new global.AudioWorkletNode(context, 'machine-sound-capture', {
                channelCount: 1,
                channelCountMode: 'explicit',
                outputChannelCount: [1]
            });

            const recorded = new Promise((resolve, reject) => {
                trackEnded = () => reject(new Error('측정 중 마이크 연결이 끊어졌습니다.'));
                stream.getAudioTracks().forEach(track => track.addEventListener('ended', trackEnded));
                recorder.onprocessorerror = () => reject(new Error('마이크 신호를 처리하지 못했습니다.'));
                recorder.port.onmessage = ({ data: chunk }) => {
                    const remaining = samples.length - samplesWritten;
                    const usable = chunk.subarray(0, remaining);
                    samples.set(usable, samplesWritten);
                    samplesWritten += usable.length;
                    onProgress?.(samplesWritten / samples.length);
                    if (samplesWritten === samples.length) resolve({ samples, sampleRate });
                };

                onProgress?.(0);
                microphone.connect(recorder);
                recorder.connect(context.destination);
            });
            return await waitFor(recorded, signal, durationMs + 5000, '마이크 입력을 받지 못했습니다. 연결을 확인해 주세요.');
        } finally {
            for (const track of stream?.getTracks() ?? []) {
                if (trackEnded) track.removeEventListener('ended', trackEnded);
                track.stop();
            }
            if (recorder) {
                recorder.port.onmessage = null;
                recorder.port.close();
                recorder.disconnect();
            }
            microphone?.disconnect();
            if (moduleUrl) URL.revokeObjectURL(moduleUrl);
            if (context.state !== 'closed') void context.close().catch(() => {});
        }
    }

    function transform(real, imaginary) {
        for (let width = 2; width <= FFT_SIZE; width *= 2) {
            const halfWidth = width / 2;
            const stride = FFT_SIZE / width;
            for (let block = 0; block < FFT_SIZE; block += width) {
                for (let offset = 0; offset < halfWidth; offset++) {
                    const left = block + offset;
                    const right = left + halfWidth;
                    const phase = offset * stride;
                    const rightReal = real[right] * twiddleReal[phase] - imaginary[right] * twiddleImaginary[phase];
                    const rightImaginary = real[right] * twiddleImaginary[phase] + imaginary[right] * twiddleReal[phase];
                    real[right] = real[left] - rightReal;
                    imaginary[right] = imaginary[left] - rightImaginary;
                    real[left] += rightReal;
                    imaginary[left] += rightImaginary;
                }
            }
        }
    }

    function decibels(power) {
        return 10 * Math.log10(Math.max(power, MIN_POWER));
    }

    function round(value, decimals = 1) {
        return Number(value.toFixed(decimals));
    }

    function analyze(samples, sampleRate) {
        if (!Number.isFinite(sampleRate) || sampleRate < HIGH_HZ * 2 || sampleRate > 192000 ||
            !samples || samples.length < Math.max(FFT_SIZE, sampleRate)) {
            throw new Error('주파수 분석에 필요한 마이크 신호가 충분하지 않습니다.');
        }

        let sum = 0;
        let squareSum = 0;
        let clipped = 0;
        for (const sample of samples) {
            if (!Number.isFinite(sample)) throw new Error('유효하지 않은 마이크 신호가 감지되었습니다.');
            sum += sample;
            squareSum += sample * sample;
            if (Math.abs(sample) >= 0.995) clipped++;
        }
        const mean = sum / samples.length;
        const rmsDb = decibels(squareSum / samples.length - mean * mean);
        if (rmsDb < -65) throw new Error('측정한 소리가 너무 작습니다. 가동 중인 설비의 측정 위치를 확인해 주세요.');
        if (clipped / samples.length >= 0.01) {
            throw new Error('측정한 소리가 너무 커서 일부 신호가 잘렸습니다. 마이크 위치를 조정해 주세요.');
        }

        const real = new Float64Array(FFT_SIZE);
        const imaginary = new Float64Array(FFT_SIZE);
        const spectrum = new Float64Array(FFT_SIZE / 2);
        const binHz = sampleRate / FFT_SIZE;
        const firstBin = Math.ceil(LOW_HZ / binHz);
        const lastBin = Math.min(spectrum.length - 1, Math.floor(HIGH_HZ / binHz));
        let frames = 0;

        // Average the power spectra of overlapping Hann-windowed frames.
        for (let start = 0; start + FFT_SIZE <= samples.length; start += FFT_SIZE / 2) {
            imaginary.fill(0);
            for (let index = 0; index < FFT_SIZE; index++) {
                real[reversedIndices[index]] = (samples[start + index] - mean) * hannWindow[index];
            }
            transform(real, imaginary);
            for (let bin = firstBin; bin <= lastBin; bin++) {
                spectrum[bin] += real[bin] ** 2 + imaginary[bin] ** 2;
            }
            frames++;
        }

        let peakBin = firstBin;
        const bandPowers = new Float64Array(bands.length);
        const scale = 2 / (FFT_SIZE * windowPower * frames);
        for (let bin = firstBin, band = 0; bin <= lastBin; bin++) {
            if (spectrum[bin] > spectrum[peakBin]) peakBin = bin;

            // Split the bin's power across any overlapping bands. This keeps
            // the frequency grid usable at both 44.1 kHz and 48 kHz capture rates.
            let startHz = Math.max(LOW_HZ, (bin - 0.5) * binHz);
            const endHz = Math.min(HIGH_HZ, (bin + 0.5) * binHz);
            while (band < bands.length && startHz < endHz) {
                const bandEndHz = Math.min(endHz, bands[band].endHz);
                if (bandEndHz > startHz) {
                    bandPowers[band] += spectrum[bin] * scale * (bandEndHz - startHz) / binHz;
                    startHz = bandEndHz;
                }
                if (bands[band].endHz <= startHz) band++;
            }
        }
        if (decibels(bandPowers.reduce((total, power) => total + power, 0)) < -65) {
            throw new Error('분석 주파수 범위에 충분한 신호가 없습니다. 측정 위치를 확인해 주세요.');
        }

        let peakOffset = 0;
        if (peakBin > firstBin && peakBin < lastBin) {
            // Refine the peak location between FFT bins using the local log spectrum.
            const left = Math.log(Math.max(spectrum[peakBin - 1], MIN_POWER));
            const center = Math.log(Math.max(spectrum[peakBin], MIN_POWER));
            const right = Math.log(Math.max(spectrum[peakBin + 1], MIN_POWER));
            const curvature = left - 2 * center + right;
            if (curvature < 0) peakOffset = Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curvature)));
        }

        return {
            version: 1,
            durationSeconds: round(samples.length / sampleRate, 3),
            sampleRate,
            rmsDb: round(rmsDb),
            peakHz: Math.round((peakBin + peakOffset) * binHz),
            bands: bands.map(({ frequencyHz }, index) => ({ frequencyHz, power: bandPowers[index] }))
        };
    }

    function validateFeatures(features) {
        if (features?.version !== 1 || !Number.isFinite(features.rmsDb) || !Number.isFinite(features.peakHz) ||
            !Array.isArray(features.bands) || features.bands.length !== bands.length || bands.some((band, index) => {
                const measured = features.bands[index];
                return measured?.frequencyHz !== band.frequencyHz || !Number.isFinite(measured.power) || measured.power < 0;
            })) {
            throw new Error('가동음 데이터 형식이 맞지 않습니다. 기준 가동음을 다시 측정해 주세요.');
        }
        const total = features.bands.reduce((sum, band) => sum + band.power, 0);
        if (!Number.isFinite(total) || total < MIN_POWER) throw new Error('비교할 가동음 신호가 충분하지 않습니다.');
        return total;
    }

    function compare(baseline, current) {
        const baselineTotal = validateFeatures(baseline);
        const currentTotal = validateFeatures(current);
        let squareDistance = 0;
        const changes = baseline.bands.map((baselineBand, index) => {
            const currentBand = current.bands[index];
            const baselineShare = baselineBand.power / baselineTotal;
            const currentShare = currentBand.power / currentTotal;
            squareDistance += (Math.sqrt(baselineShare) - Math.sqrt(currentShare)) ** 2;
            const baselineDb = decibels(baselineBand.power);
            const currentDb = decibels(currentBand.power);
            const share = Math.max(baselineShare, currentShare);
            const changeDb = currentDb - baselineDb;
            return {
                frequencyHz: baselineBand.frequencyHz,
                baselineDb: round(baselineDb),
                currentDb: round(currentDb),
                changeDb: round(changeDb),
                share,
                weight: share * Math.abs(changeDb)
            };
        });

        const distance = Math.min(1, Math.sqrt(squareDistance / 2));
        const rmsChangeDb = current.rmsDb - baseline.rmsDb;
        return {
            // Initial screening thresholds. They require validation for each equipment type.
            status: distance >= 0.25 || Math.abs(rmsChangeDb) >= 6 ? 'different' : 'similar',
            distance: round(distance, 3),
            rmsChangeDb: round(rmsChangeDb),
            bandChanges: changes
                .filter(change => change.share >= 0.01 && Math.abs(change.changeDb) >= 0.5)
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 5)
                .map(({ share, weight, ...change }) => change),
            baselinePeakHz: baseline.peakHz,
            currentPeakHz: current.peakHz
        };
    }

    global.AudioAnalysis = Object.freeze({ prepareCapture, capture, analyze, compare });
})(globalThis);
