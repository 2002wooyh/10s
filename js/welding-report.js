(() => {
    'use strict';

    const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const icon = (name, size) => globalThis.DemoIcon(name, size);
    const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
    const time = seconds => {
        const whole = Math.max(0, Math.floor(seconds));
        return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
    };
    const outline = { left: 35, right: 307, top: 17, bottom: 131 };

    function graphFrame({ name, unit, xTicks, yTicks, content }) {
        const { left, right, bottom } = outline;
        return `<svg class="weld-plot" viewBox="0 0 320 159" role="img" aria-label="${escape(name)}">
            <text class="weld-axis-label" x="${left}" y="11">${escape(unit)}</text>
            ${yTicks.slice(0, -1).map(([position]) => `<line class="weld-grid" x1="${left}" x2="${right}" y1="${position}" y2="${position}"></line>`).join('')}
            ${yTicks.map(([position, label]) => `<text class="weld-axis-label" x="${left - 5}" y="${position + 3}" text-anchor="end">${label}</text>`).join('')}
            <line class="weld-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"></line>
            ${xTicks.map(([position, label], index) => `<text class="weld-axis-label" x="${position}" y="149" text-anchor="${index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}">${label}</text>`).join('')}
            ${content}
        </svg>`;
    }

    function waveform(signal) {
        const { left, right, top, bottom } = outline;
        const peak = Math.max(.01, ...signal.waveform.map(point => Math.max(Math.abs(point.min), Math.abs(point.max))));
        const limit = Math.min(1, Math.ceil(peak * 10) / 10);
        const x = value => left + (right - left) * value / signal.durationSeconds;
        const y = value => bottom - (bottom - top) * (value + limit) / (2 * limit);
        const points = [...signal.waveform.map(point => [point.timeSeconds, point.max]),
            ...signal.waveform.slice().reverse().map(point => [point.timeSeconds, point.min])];
        const path = points.map(([seconds, amplitude], index) =>
            `${index ? 'L' : 'M'}${x(seconds).toFixed(1)},${y(amplitude).toFixed(1)}`).join(' ');
        return graphFrame({
            name: '용접 녹음의 시간 파형. 시간에 따른 디지털 진폭.',
            unit: '디지털 진폭',
            xTicks: [0, .25, .5, .75, 1].map(fraction => {
                const seconds = fraction * signal.durationSeconds;
                return [x(seconds), number.format(seconds) + '초'];
            }),
            yTicks: [limit, 0, -limit].map(value => [y(value), number.format(value)]),
            content: `<path class="weld-waveform" d="${path} Z"></path>`
        });
    }

    function spectrum(signal) {
        const { left, right, top, bottom } = outline;
        const end = signal.fft.nyquistHz;
        const high = Math.ceil(Math.max(...signal.spectrum.map(point => point.dbFS)) / 10) * 10;
        const low = signal.fft.minDbFS;
        const x = value => left + (right - left) * value / end;
        const y = value => bottom - (bottom - top) * (Math.max(low, value) - low) / (high - low);
        const path = signal.spectrum.map((point, index) =>
            `${index ? 'L' : 'M'}${x(point.frequencyHz).toFixed(4)},${y(point.dbFS).toFixed(1)}`).join(' ');
        const area = `${path} L${x(signal.spectrum.at(-1).frequencyHz)},${bottom} H${x(signal.spectrum[0].frequencyHz)} Z`;
        return `<svg class="weld-plot" data-weld-fft data-start="0" data-end="${end}" viewBox="0 0 320 159"
            role="img" aria-label="녹음의 FFT 스펙트럼, 0에서 ${end} Hz 구간">
            <defs><clipPath id="weld-fft-clip"><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"></rect></clipPath></defs>
            <text class="weld-axis-label" x="${right}" y="11" text-anchor="end">디지털 레벨 (dBFS)</text>
            ${[high, (high + low) / 2, low].map(value => `<text class="weld-axis-label" x="${left - 5}" y="${y(value) + 3}" text-anchor="end">${value}</text>`).join('')}
            ${[high, (high + low) / 2].map(value => `<line class="weld-grid" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"></line>`).join('')}
            <line class="weld-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"></line>
            ${[0, 1, 2, 3].map(index => {
                const value = end * index / 3;
                const anchor = index === 0 ? 'start' : index === 3 ? 'end' : 'middle';
                return `<text class="weld-axis-label" x="${x(value)}" y="149" text-anchor="${anchor}">${number.format(Math.round(value))}${index === 3 ? ' Hz' : ''}</text>`;
            }).join('')}
            <g clip-path="url(#weld-fft-clip)">
                <path class="weld-spectrum-fill" d="${area}"></path>
                <path class="weld-spectrum-line" d="${path}"></path>
            </g>
            <circle class="weld-peak-dot" cx="${x(signal.fft.peakHz)}" cy="${y(signal.fft.peakDbFS)}" r="3.5"></circle>
        </svg>`;
    }

    const summary = '다음 점검에서는 같은 위치와 운전 조건에서 가동음을 기록해 비교해 보세요. 용접 상태는 보호가스 유량계와 용접부를 함께 보면 더 자세히 확인할 수 있어요.';
    const checks = [
        ['보호가스 유량', '유량계 기록을 작업 기준과 비교해요.'],
        ['스패터', '용접선 주변에 튄 금속 방울을 확인해요.'],
        ['험핑·용락', '용접선이 반복해서 솟았거나 구멍이 생겼는지 확인해요.']
    ];

    function suggestedQuestions(signal) {
        return [
            `${number.format(signal.fft.peakHz)} Hz는 어떤 의미인가요?`,
            '가스 유량은 어떻게 확인해요?'
        ];
    }

    function skeleton() {
        return `<div class="weld-report weld-skeleton" data-weld-skeleton role="status">
            <span class="visually-hidden">AI 분석 리포트를 준비하고 있어요.</span>
            <header class="weld-identity" aria-hidden="true">
                <div class="weld-identity-copy">
                    <i class="weld-shimmer weld-skeleton-name"></i>
                    <i class="weld-shimmer weld-skeleton-model"></i>
                    <i class="weld-shimmer weld-skeleton-date"></i>
                </div>
                <div class="weld-photo"><i class="weld-shimmer weld-skeleton-photo"></i></div>
            </header>
            <section class="weld-assessment" aria-hidden="true">
                <i class="weld-shimmer weld-skeleton-status"></i>
                <i class="weld-shimmer weld-skeleton-heading"></i>
                <i class="weld-shimmer weld-skeleton-copy"></i>
                <div class="weld-player"><i class="weld-shimmer"></i><i class="weld-shimmer"></i></div>
            </section>
            <section class="weld-section weld-chart-panel" aria-hidden="true">
                <i class="weld-shimmer weld-skeleton-heading"></i>
                <i class="weld-shimmer weld-skeleton-copy"></i>
                <div class="weld-chart weld-skeleton-plot"><i class="weld-shimmer"></i></div>
            </section>
        </div>`;
    }

    function render(report, { image, canRepeat }) {
        const signal = globalThis.WeldingSignal;
        const recordedAt = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.createdAt));
        const equipment = image || globalThis.TenData.homeDemoDevice().image;
        return `<article class="weld-report" data-weld-report aria-label="CMT 용접기 AI 분석 리포트">
            <header class="weld-identity">
                <div class="weld-identity-copy">
                    <h2>${escape(report.deviceName)}</h2>
                    <p class="weld-model">${escape(report.model)}</p>
                    <p class="weld-date">분석 일시 · ${escape(recordedAt)}</p>
                </div>
                <div class="weld-photo"><img class="weld-equipment-photo" src="${escape(equipment)}" alt="" width="768" height="768"></div>
            </header>
            <section class="weld-assessment">
                <p class="weld-assessment-label">${icon('check', 16)} 분석 완료</p>
                <h3>용접기의 가동음을 살펴봤어요</h3>
                <p>분석한 ${number.format(signal.durationSeconds)}초의 녹음을 들을 수 있어요.</p>
                <div class="weld-player">
                    <button type="button" class="weld-play" data-weld-play><span data-weld-play-icon aria-hidden="true">${icon('play', 17)}</span><span data-weld-play-text>다시 듣기</span></button>
                    <div class="weld-player-track">
                        <input type="range" class="weld-seek" data-weld-seek min="0" max="${signal.durationSeconds}" step=".01" value="0" aria-label="녹음 재생 위치">
                        <span data-weld-time>0:00 / ${time(signal.durationSeconds)}</span>
                    </div>
                    <audio data-weld-audio src="${escape(signal.assetUrl)}" preload="metadata"></audio>
                </div>
                <p class="weld-player-status" data-weld-player-status role="status" hidden></p>
            </section>
            <section class="weld-section weld-chart-panel">
                <h3>녹음 파형</h3>
                <p>시간에 따른 소리 크기를 보여줘요.</p>
                <figure class="weld-chart">${waveform(signal)}<figcaption>전체 녹음 · ${signal.durationSeconds.toFixed(1)}초</figcaption></figure>
            </section>
            <section class="weld-section weld-chart-panel weld-spectrum" aria-labelledby="weld-fft-title">
                <h3 id="weld-fft-title">주파수 분석</h3>
                <p>같은 녹음에 푸리에 변환(FFT)을 적용해 주파수별 크기를 구했어요.</p>
                <figure class="weld-chart">${spectrum(signal)}</figure>
                <dl class="weld-signal-facts" aria-label="녹음에서 계산한 값">
                    <div><dt>녹음 길이</dt><dd>${signal.durationSeconds.toFixed(1)}<small>초</small></dd></div>
                    <div><dt>가장 큰 성분</dt><dd>${number.format(signal.fft.peakHz)}<small>Hz</small></dd></div>
                    <div><dt>해당 레벨</dt><dd>${signal.fft.peakDbFS}<small>dBFS</small></dd></div>
                </dl>
                <div class="weld-fft-note">
                    ${icon('waveform', 18)}
                    <p>그래프의 파란 점이 가장 크게 나타난 ${number.format(signal.fft.peakHz)} Hz 성분이에요.</p>
                </div>
                <details class="weld-method"><summary>그래프 계산 방법</summary>
                    <p>${number.format(signal.sampleRate / 1000)} kHz 녹음의 좌우 채널을 평균하고 Hann 창을 적용해 전체 ${number.format(signal.durationSeconds)}초의 FFT를 계산했어요. 그래프에는 ${signal.fft.displayBucketHz} Hz마다 가장 큰 성분을 표시했어요. dBFS는 녹음 파일 안의 디지털 레벨이에요.</p>
                </details>
            </section>
            <section class="weld-summary" data-weld-reveal>
                <h3>분석 요약</h3>
                <p>${summary}</p>
                <dl class="weld-summary-checks">${checks.map(([name, copy]) => `<div>
                    <dt><span class="weld-check-icon">${icon('check', 15)}</span>${name}</dt><dd>${copy}</dd>
                </div>`).join('')}</dl>
            </section>
            <div class="weld-actions">
                ${canRepeat ? `<button class="btn-secondary" type="button" data-action="run-demo" data-id="${escape(report.deviceId)}">${icon('waveform', 18)} 다시 점검</button>` : ''}
                <button class="btn-secondary" type="button" data-action="download-report" data-id="${escape(report.id)}">${icon('download', 18)} 리포트 저장</button>
            </div>
            ${globalThis.ReportChat.questions({ id: 'weld-questions-title', questions: suggestedQuestions(signal) })}
        </article>`;
    }

    function mount(root, { onQuestion }) {
        const host = root.querySelector('[data-weld-report]');
        const audio = host.querySelector('[data-weld-audio]');
        const button = host.querySelector('[data-weld-play]');
        const label = host.querySelector('[data-weld-play-text]');
        const symbol = host.querySelector('[data-weld-play-icon]');
        const seek = host.querySelector('[data-weld-seek]');
        const timer = host.querySelector('[data-weld-time]');
        const status = host.querySelector('[data-weld-player-status]');
        const signal = globalThis.WeldingSignal;
        const events = new AbortController();
        const options = { signal: events.signal };

        function updateAudio() {
            const duration = Number.isFinite(audio.duration) ? audio.duration : signal.durationSeconds;
            seek.max = duration;
            seek.value = audio.currentTime;
            seek.setAttribute('aria-valuetext', `${time(audio.currentTime)} / ${time(duration)}`);
            seek.style.setProperty('--weld-played', Math.min(100, audio.currentTime / duration * 100) + '%');
            timer.textContent = `${time(audio.currentTime)} / ${time(duration)}`;
            label.textContent = audio.paused ? '다시 듣기' : '일시정지';
            symbol.innerHTML = icon(audio.paused ? 'play' : 'pause', 17);
        }

        function showAudioError() {
            status.textContent = '녹음 재생에 실패했어요. 다시 눌러 주세요.';
            status.hidden = false;
        }

        button.addEventListener('click', () => {
            if (!audio.paused) {
                audio.pause();
                return;
            }
            status.hidden = true;
            if (audio.ended) audio.currentTime = 0;
            audio.play().catch(() => {
                if (!events.signal.aborted) showAudioError();
            });
        }, options);
        seek.addEventListener('input', () => {
            if (audio.readyState) audio.currentTime = Number(seek.value);
        }, options);
        for (const event of ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended']) {
            audio.addEventListener(event, updateAudio, options);
        }
        audio.addEventListener('error', showAudioError, options);
        updateAudio();

        const unbindQuestions = globalThis.ReportChat.bindQuestions(
            host.querySelector('[data-report-chat-questions]'), onQuestion
        );

        let observer;
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
            observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    entry.target.classList.add('is-in-view');
                    observer.unobserve(entry.target);
                }
            }, { root, threshold: .14 });
            host.classList.add('weld-reveal-enabled');
            host.querySelectorAll('[data-weld-reveal]').forEach(section => observer.observe(section));
        }
        return () => {
            events.abort();
            unbindQuestions();
            audio.pause();
            observer?.disconnect();
        };
    }

    function exportLines() {
        const signal = globalThis.WeldingSignal;
        return [
            `용접 녹음 · ${signal.durationSeconds.toFixed(1)}초 · 샘플링 주파수 ${number.format(signal.sampleRate)} Hz`,
            `FFT의 가장 큰 주파수 성분 · ${number.format(signal.fft.peakHz)} Hz`,
            '', '분석 요약', summary,
            ...checks.map(([name, copy]) => `${name} · ${copy}`)
        ];
    }

    globalThis.WeldingReport = { render, skeleton, mount, exportLines };
})();
