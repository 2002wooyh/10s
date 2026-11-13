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

    function spectrum(signal, assessment) {
        const { left, right, top, bottom } = outline;
        const end = signal.fft.nyquistHz;
        const high = Math.ceil(Math.max(...signal.spectrum.map(point => point.dbFS)) / 10) * 10;
        const low = signal.fft.minDbFS;
        const x = value => left + (right - left) * value / end;
        const y = value => bottom - (bottom - top) * (Math.max(low, value) - low) / (high - low);
        const path = signal.spectrum.map((point, index) =>
            `${index ? 'L' : 'M'}${x(point.frequencyHz).toFixed(4)},${y(point.dbFS).toFixed(1)}`).join(' ');
        const area = `${path} L${x(signal.spectrum.at(-1).frequencyHz)},${bottom} H${x(signal.spectrum[0].frequencyHz)} Z`;
        const bands = [
            ['gas', assessment.gas.band], ['spatter', assessment.spatter.band]
        ].map(([name, [from, to]]) => `<rect class="weld-band-${name}" x="${x(from)}" y="${top}"
            width="${x(to) - x(from)}" height="${bottom - top}" aria-hidden="true"></rect>`).join('');
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
                ${bands}
                <path class="weld-spectrum-line" d="${path}"></path>
            </g>
            <circle class="weld-peak-dot" cx="${x(signal.fft.peakHz)}" cy="${y(signal.fft.peakDbFS)}" r="3.5"></circle>
        </svg>`;
    }

    const scoreSummary = '보호가스가 많이 흐르고 아크가 불안정했을 가능성이 있어요. 용접선이 고르게 이어졌는지도 살펴보세요.';
    const nextChecks = [
        ['유량계부터 확인해요', '작업 중 유량계 값이 작업 기준보다 높았는지 살펴보세요.'],
        ['용접선과 주변을 살펴봐요', '튀어 붙은 금속 방울과 용접선이 물결처럼 솟은 곳이 있는지 확인해요.'],
        ['같은 조건에서 다시 비교해요', '다음에도 같은 위치에서 소리를 기록하면 달라진 부분을 찾기 쉬워요.']
    ];

    function findings(signal, assessment) {
        const { gas, spatter } = assessment;
        const band = ([low, high]) => `${number.format(low)}–${number.format(high)} Hz`;
        const gasChange = assessment.gasChangeDb(signal);
        return [
            {
                key: 'gas', name: '보호가스 유량',
                heading: '가스가 기준보다 많이 흐른 것으로 보여요',
                metric: `${band(gas.band)} · 비교 기준보다 +${number.format(gasChange)} dB`,
                copy: `이 음역대의 소리가 비교 기준보다 컸어요. 보호가스는 기준보다 ${gas.estimatedFlow - gas.referenceFlow} L/min 더 흘렀을 가능성이 있어요.`,
                comparison: [gas.referenceFlow, gas.estimatedFlow, 'L/min'],
                action: '작업 기준과 유량계에 표시된 값을 비교해 보세요.'
            },
            {
                key: 'spatter', name: '아크 안정성',
                heading: '아크가 불안정해요',
                metric: `${band(spatter.band)} · 아크 안정성 분석 대역`,
                copy: '아크는 금속을 녹이는 전기 불꽃이에요. 높은 음역대의 소리로 볼 때 불꽃이 고르지 않았을 가능성이 있어요. 이때 스패터라고 부르는 작은 금속 방울도 튀었을 수 있어요.',
                comparison: [spatter.referenceCount, spatter.estimatedCount, '회'],
                action: '용접선 주변의 작은 방울 자국을 확인해 보세요.'
            },
            {
                key: 'humping', name: '용접선 모양',
                heading: '용접선에 험핑이 의심돼요',
                copy: '험핑은 용접선이 물결처럼 반복해서 솟는 현상이에요. 소리가 고르지 않았다는 해석을 바탕으로, 먼저 눈으로 확인할 항목에 넣었어요.',
                action: '용접선을 따라 일정한 간격으로 볼록한 곳이 있는지 살펴보세요.'
            }
        ];
    }

    function recordingPlayer(signal) {
        return `<div class="weld-player">
            <button type="button" class="weld-play" data-weld-play><span data-weld-play-icon aria-hidden="true">${icon('play', 17)}</span><span data-weld-play-text>다시 듣기</span></button>
            <div class="weld-player-track">
                <input type="range" class="weld-seek" data-weld-seek min="0" max="${signal.durationSeconds}" step=".01" value="0" aria-label="녹음 재생 위치">
                <span data-weld-time>0:00 / ${time(signal.durationSeconds)}</span>
            </div>
            <audio data-weld-audio src="${escape(signal.assetUrl)}" preload="metadata"></audio>
        </div>
        <p class="weld-player-status" data-weld-player-status role="status" hidden></p>`;
    }

    function scoreCard({ score, maxScore, scoreLabel }, signal) {
        return `<section class="weld-score" data-weld-score aria-labelledby="weld-score-title">
            <p class="weld-score-label" id="weld-score-title">${scoreLabel}</p>
            <p class="weld-score-value"><strong>${score}</strong><span>/ ${maxScore}점</span></p>
            <div class="weld-score-track" aria-hidden="true" style="--score:${100 * score / maxScore}%"><i></i></div>
            <div class="weld-score-scale" aria-hidden="true"><span>0</span><span>${maxScore / 2}</span><span>${maxScore}</span></div>
            <div class="weld-score-summary"><h3>용접 조건을 한 번 더 확인해요</h3><p>${scoreSummary}</p></div>
            ${recordingPlayer(signal)}
        </section>`;
    }

    function conditionValue({ key, value }) {
        return key === 'wireFeedSpeed' ? value.toFixed(1) : number.format(value);
    }

    function conditionPanel(conditions) {
        return `<section class="weld-section weld-conditions" data-weld-conditions aria-labelledby="weld-conditions-title">
            <h3 id="weld-conditions-title">용접 조건 <small class="weld-conditions-estimate">(추정)</small></h3>
            <dl>${conditions.map(condition => `<div>
                <dt><span class="weld-condition-name">${condition.label}</span>
                    <span class="weld-condition-status" data-tone="${condition.tone}">${condition.status}</span></dt>
                <dd><strong>${conditionValue(condition)}</strong> <span>${condition.unit}</span></dd>
            </div>`).join('')}</dl>
        </section>`;
    }

    function findingCard(item) {
        const arcIcon = `<span class="weld-finding-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55"
                stroke-linecap="round" stroke-linejoin="round"><path d="m13 4-5 8h4l-1 8 6-10h-4zM5 7l2 2m12 6 2 2M4 16l2-1"/></svg>
        </span>`;
        const comparison = item.comparison && [
            ['비교 기준', item.comparison[0]], ['추정', item.comparison[1]]
        ].map(([label, value]) => `<div><span>${label}</span>
            <div aria-hidden="true"><i style="width:${100 * value / Math.max(...item.comparison.slice(0, 2))}%"></i></div>
            <strong>${value} ${item.comparison[2]}</strong></div>`).join('');
        return `<article class="weld-finding" data-weld-finding="${item.key}">
            <div class="weld-finding-head">
                ${item.key === 'spatter' ? arcIcon : ''}
                <div><small>${item.name}</small><h4>${item.heading}</h4></div>
            </div>
            ${item.metric ? `<span class="weld-finding-meta">${item.metric}</span>` : ''}
            <p class="weld-finding-copy">${item.copy}</p>
            ${comparison ? `<div class="weld-finding-compare">${item.key === 'spatter' ? '<p>스패터 횟수</p>' : ''}${comparison}</div>` : ''}
            <p class="weld-finding-action">${item.action}</p>
        </article>`;
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
            <section class="weld-score" aria-hidden="true">
                <i class="weld-shimmer weld-skeleton-status"></i>
                <i class="weld-shimmer weld-skeleton-score"></i>
                <i class="weld-shimmer weld-skeleton-score-track"></i>
                <i class="weld-shimmer weld-skeleton-score-scale"></i>
                <div class="weld-score-summary">
                    <i class="weld-shimmer weld-skeleton-heading"></i>
                    <i class="weld-shimmer weld-skeleton-copy"></i>
                </div>
                <div class="weld-player"><i class="weld-shimmer"></i><i class="weld-shimmer"></i></div>
            </section>
            <section class="weld-section weld-conditions" aria-hidden="true">
                <i class="weld-shimmer weld-skeleton-heading"></i>
                <div class="weld-conditions-placeholder"><i class="weld-shimmer"></i><i class="weld-shimmer"></i></div>
            </section>
        </div>`;
    }

    function render(report, { image, canRepeat }) {
        const signal = globalThis.WeldingSignal;
        const assessment = globalThis.WeldingCase;
        const createdAt = new Date(report.createdAt);
        const recordedAt = Number.isNaN(createdAt.getTime()) ? ''
            : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(createdAt);
        const equipment = image || globalThis.TenData.homeDemoDevice().image;
        return `<article class="weld-report" data-weld-report aria-label="CMT 용접기 AI 분석 리포트">
            <header class="weld-identity">
                <div class="weld-identity-copy">
                    <h2>${escape(report.deviceName)}</h2>
                    <p class="weld-model">${escape(report.model)}</p>
                    ${recordedAt ? `<p class="weld-date">분석 일시 · ${escape(recordedAt)}</p>` : ''}
                </div>
                <div class="weld-photo"><img class="weld-equipment-photo" src="${escape(equipment)}" alt="" width="768" height="768"></div>
            </header>
            ${scoreCard(assessment, signal)}
            ${conditionPanel(assessment.conditions)}
            <section class="weld-section weld-chart-panel" data-weld-waveform aria-labelledby="weld-waveform-title">
                <h3 id="weld-waveform-title">녹음 파형</h3>
                <p>10초 동안 소리가 언제 커지고 작아졌는지 보여줘요.</p>
                <figure class="weld-chart">${waveform(signal)}</figure>
            </section>
            <section class="weld-section weld-chart-panel weld-spectrum" aria-labelledby="weld-fft-title">
                <h3 id="weld-fft-title">푸리에 변환 (FFT)</h3>
                <p>10초 녹음을 낮은 소리부터 높은 소리까지 나눠봤어요.</p>
                <figure class="weld-chart">${spectrum(signal, assessment)}
                    <figcaption class="weld-band-legend">
                        <span><i class="weld-band-gas"></i>보호가스 분석 대역</span>
                        <span><i class="weld-band-spatter"></i>아크 안정성 분석 대역</span>
                    </figcaption>
                </figure>
                <div class="weld-fft-note">
                    <p>파란 점은 녹음에서 가장 강했던 ${number.format(signal.fft.peakHz)} Hz를 표시해요.</p>
                </div>
                <details class="weld-method"><summary>주파수 그래프는 어떻게 읽나요?</summary>
                    <p>가로축은 소리의 높낮이(Hz), 세로축은 녹음 파일에서의 크기(dBFS)예요. ${number.format(signal.sampleRate / 1000)} kHz 녹음의 좌우 채널을 평균하고 Hann 창을 적용해 FFT를 계산했어요. 그래프에는 ${signal.fft.displayBucketHz} Hz마다 가장 큰 성분을 표시했어요.</p>
                </details>
            </section>
            <section class="weld-findings" aria-labelledby="weld-findings-title">
                <header><h3 id="weld-findings-title">가동음에서 살펴본 변화</h3></header>
                ${findings(signal, assessment).map(findingCard).join('')}
            </section>
            <section class="weld-next">
                <h3>다음 점검은 이렇게 해보세요</h3>
                <ul>${nextChecks.map(([name, copy]) => `<li><strong>${name}</strong><p>${copy}</p></li>`).join('')}</ul>
            </section>
            <div class="weld-actions">
                ${canRepeat ? `<button class="btn-secondary" type="button" data-action="remeasure" data-id="${escape(report.deviceId)}">다시 측정</button>` : ''}
                <button class="btn-secondary" type="button" data-action="download-report" data-id="${escape(report.id)}">리포트 저장</button>
            </div>
            ${globalThis.ReportChat.questions({ id: 'weld-questions-title', questions: [
                '종합 점수는 어떤 의미인가요?', '가스 유량은 어떻게 확인해요?'
            ] })}
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

        return () => {
            events.abort();
            unbindQuestions();
            audio.pause();
        };
    }

    function exportLines() {
        const signal = globalThis.WeldingSignal;
        const assessment = globalThis.WeldingCase;
        return [
            `${assessment.scoreLabel} ${assessment.score}/${assessment.maxScore}점`, scoreSummary,
            '', '용접 조건 (추정)',
            ...assessment.conditions.map(condition => `${condition.label} · ${conditionValue(condition)} ${condition.unit} · ${condition.status}`),
            '',
            `용접 녹음 · ${signal.durationSeconds.toFixed(1)}초 · 샘플링 주파수 ${number.format(signal.sampleRate)} Hz`,
            `FFT의 가장 큰 주파수 성분 · ${number.format(signal.fft.peakHz)} Hz · ${signal.fft.peakDbFS} dBFS`,
            ...findings(signal, assessment).flatMap(item => [
                '', item.name, item.heading, item.metric, item.copy,
                item.comparison && `${item.key === 'spatter' ? '스패터 횟수 · ' : ''}비교 기준 ${item.comparison[0]} ${item.comparison[2]} · 추정 ${item.comparison[1]} ${item.comparison[2]}`,
                item.action
            ].filter(Boolean)),
            '', '다음 점검', ...nextChecks.map(([name, copy]) => `${name} · ${copy}`)
        ];
    }

    globalThis.WeldingReport = { render, skeleton, mount, exportLines };
})();
