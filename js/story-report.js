(() => {
    'use strict';

    const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
    const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
    const icon = (name, size) => globalThis.DemoIcon?.(name, size) || '';
    const hz = value => number.format(value) + ' Hz';
    const db = value => (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
    const level = value => value.toFixed(1) + ' dBFS';

    function readSignal(report) {
        const valid = point => point && Number.isFinite(point.hz) &&
            Number.isFinite(point.baseline) && Number.isFinite(point.measured);
        const points = (Array.isArray(report.spectrum) ? report.spectrum : []).filter(valid)
            .sort((a, b) => a.hz - b.hz);
        const samples = (Array.isArray(report.peaks) ? report.peaks : []).filter(valid);
        const focus = (samples.length ? samples : points).reduce((winner, point) => {
            const change = Math.round((point.measured - point.baseline) * 10) / 10;
            return !winner || Math.abs(change) > Math.abs(winner.change) ? { ...point, change } : winner;
        }, null);
        return { points, focus };
    }

    function chart({ points, focus }, zoom = false) {
        if (points.length < 2 || points[0].hz === points.at(-1).hz) return '';

        const left = 32, right = 310, top = 30, bottom = 145;
        const minHz = points[0].hz;
        const maxHz = points.at(-1).hz;
        const window = Math.max(26, (maxHz - minHz) * .055);
        const start = zoom && focus ? Math.max(minHz, focus.hz - window) : minHz;
        const end = zoom && focus ? Math.min(maxHz, focus.hz + window) : maxHz;
        // Include the adjacent samples so the visible traces meet the viewport edges.
        const first = Math.max(0, points.findIndex(point => point.hz >= start) - 1);
        const last = points.findIndex(point => point.hz > end);
        const visible = points.slice(first, last === -1 ? undefined : last + 1);
        const levels = visible.flatMap(point => [point.baseline, point.measured]);
        const low = Math.floor(Math.min(...levels) / 10) * 10;
        const high = Math.max(low + 10, Math.ceil(Math.max(...levels) / 10) * 10);
        const x = value => left + (right - left) * (value - start) / (end - start);
        const y = value => bottom - (bottom - top) * (value - low) / (high - low);
        const path = key => visible.map((point, index) =>
            (index ? 'L' : 'M') + x(point.hz).toFixed(1) + ',' + y(point[key]).toFixed(1)).join(' ');
        const grid = [0, 1, 2, 3].map(index => {
            const value = low + (high - low) * index / 3;
            const row = y(value).toFixed(1);
            return `<line class="story-chart-grid" x1="${left}" x2="${right}" y1="${row}" y2="${row}"></line>
                <text x="${left - 6}" y="${Number(row) + 3}" text-anchor="end">${Math.round(value)}</text>`;
        }).join('');
        const ticks = [0, 1, 2, 3].map(index => {
            const value = start + (end - start) * index / 3;
            const anchor = index === 0 ? 'start' : index === 3 ? 'end' : 'middle';
            return `<text x="${x(value)}" y="166" text-anchor="${anchor}">${number.format(Math.round(value))}${index === 3 ? ' Hz' : ''}</text>`;
        }).join('');
        const bandHalf = (end - start) * (zoom ? .12 : .024);
        const bandLeft = focus ? x(Math.max(start, focus.hz - bandHalf)) : 0;
        const bandWidth = focus ? x(Math.min(end, focus.hz + bandHalf)) - bandLeft : 0;
        const highlight = focus ? `<rect class="story-chart-band" x="${bandLeft}" width="${bandWidth}" y="${top}" height="${bottom - top}" rx="5"></rect>
            <line class="story-chart-marker" x1="${x(focus.hz)}" x2="${x(focus.hz)}" y1="${top}" y2="${bottom}"></line>` : '';
        const label = focus && Math.abs(focus.change) >= 3 ? '여기가 달랐어요' : '비교한 지점';
        const labelX = focus ? Math.max(left, Math.min(right - 86, x(focus.hz) - 43)) : 0;
        const anchorX = focus ? Math.max(labelX + 9, Math.min(labelX + 77, x(focus.hz))) : 0;
        const dot = focus ? `<circle class="story-chart-dot" cx="${x(focus.hz)}" cy="${y(focus.measured)}" r="4.5"></circle>
            <g class="story-chart-callout"><path d="M ${anchorX - 3} 22 L ${x(focus.hz)} ${top} L ${anchorX + 3} 22 Z"></path>
                <rect x="${labelX}" y="3" width="86" height="20" rx="7"></rect>
                <text x="${labelX + 43}" y="16" text-anchor="middle">${label}</text></g>` : '';
        return `<svg class="story-plot" viewBox="0 0 320 173" role="img" aria-label="${zoom ? '선택 대역 확대. ' : ''}기준음과 비교음의 주파수 그래프. 가로축 주파수, 세로축 디지털 레벨 dBFS.">
            <defs><clipPath id="story-chart-clip"><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"></rect></clipPath></defs>
            ${grid}${ticks}
            <g clip-path="url(#story-chart-clip)">
                ${highlight}<path class="story-chart-base" d="${path('baseline')}"></path>
                <path class="story-chart-current" d="${path('measured')}"></path>
            </g>${dot}
        </svg>`;
    }

    function skeleton() {
        return `<div class="story-skeleton" role="status">
            <span class="story-sr-only">시연 리포트를 준비하고 있어요.</span>
            <div class="story-skeleton-hero" aria-hidden="true">
                <i class="story-skeleton-orb"></i><i></i><i></i><i></i>
            </div>
            <div class="story-skeleton-section" aria-hidden="true">
                <i></i><i class="story-skeleton-chart"></i>
            </div>
        </div>`;
    }

    function peakSentence(peak) {
        if (!peak) return '비교음을 기준음과 같은 주파수 축에 놓아 살펴봤어요.';
        if (peak.change === 0) return `${hz(peak.hz)} 지점의 소리 레벨이 기준음과 같았어요.`;
        return `${hz(peak.hz)} 지점의 소리 레벨이 기준보다 ${Math.abs(peak.change).toFixed(1)} dB ${peak.change > 0 ? '높았어요' : '낮았어요'}.`;
    }

    function guidance(report, peak) {
        if (report.status === 'stable') {
            return '주요 소리 패턴이 기준음과 비슷했어요. 같은 조건의 기록을 쌓아두면 다음 점검에서 변화가 생겼을 때 비교하기 쉬워요.';
        }
        if (!peak) return '같은 운전 조건으로 다시 들어보고 소리의 변화가 이어지는지 확인해 보세요.';
        return `먼저 ${hz(peak.hz)} 부근에 주목했어요. 동작 속도·부하·주변 소음이 달라져도 이 구간의 소리는 변할 수 있어요. 같은 조건으로 다시 측정하면 변화가 반복되는지 확인할 수 있어요.`;
    }

    function questions(report, peak) {
        const checks = Array.isArray(report.nextChecks) ? report.nextChecks.filter(Boolean) : [];
        return [
            {
                label: peak ? `왜 ${hz(peak.hz)}를 봤나요?` : '그래프는 어떻게 읽나요?',
                answer: peak
                    ? `표시한 성분 중 기준과 비교의 차이가 큰 지점이에요. ${hz(peak.hz)}에서 기준음은 ${level(peak.baseline)}, 비교음은 ${level(peak.measured)}였어요. 파란 점이 비교음의 위치를 나타내요.`
                    : '회색 점선은 기준음, 파란 실선은 이번 비교음을 보여줘요. 두 선 사이가 벌어진 주파수를 살펴보면 변화 위치를 찾을 수 있어요.'
            },
            {
                label: '정비 판단에 어떻게 써요?',
                answer: '이 리포트는 장비별 예시 음향 변화와 확인 순서를 보여줘요. 실제 정비 판단은 같은 운전 조건의 반복 측정 기록과 담당자 점검을 함께 확인해 주세요.'
            },
            {
                label: '다음엔 뭘 확인해요?',
                answer: checks.length ? checks.join(' ') : '같은 운전 조건과 지정 측정 위치에서 비교해 주세요.'
            }
        ];
    }

    function render(report, { canRepeat = true } = {}) {
        if (!report) return '<div class="empty-state"><strong>리포트를 찾을 수 없습니다</strong></div>';
        const status = ['stable', 'attention', 'check'].includes(report.status) ? report.status : 'check';
        const headline = {
            stable: '기준음과 비슷했어요',
            attention: '달라진 소리가 있었어요',
            check: '한 번 더 들어보면 좋아요'
        }[status];
        const data = readSignal(report);
        const { focus } = data;
        const items = Array.isArray(report.nextChecks) ? report.nextChecks.filter(Boolean) : [];
        const observations = Array.isArray(report.observations) ? report.observations.filter(Boolean) : [];
        const created = new Date(report.createdAt);
        const dateText = Number.isNaN(created.getTime()) ? '' : date.format(created);
        const availableQuestions = questions(report, focus);
        const graph = chart(data);
        const identity = [report.model, report.point].filter(Boolean).map(escape).join(' · ');

        return `<article class="story-report" data-story-report aria-label="장비 가동음 시연 리포트">
            <section class="story-hero" aria-labelledby="story-title">
                <div class="story-visual" aria-hidden="true">
                    <span class="story-visual-orb">${icon('waveform', 37)}</span>
                    <span class="story-visual-badge">${icon(status === 'stable' ? 'check' : 'info', 16)}</span>
                </div>
                <div class="story-hero-copy">
                    <span class="story-label">시연 리포트</span>
                    <h2 id="story-title">${headline}</h2>
                    <p class="story-lead">${escape(report.summary)}</p>
                </div>
            </section>
            <div class="story-identity">
                <span class="story-identity-icon">${icon('devices', 20)}</span>
                <div><p class="story-device">${escape(report.deviceName)}</p>
                    ${identity ? `<p class="story-model">${identity}</p>` : ''}
                    ${dateText ? `<time datetime="${escape(report.createdAt)}">${escape(dateText)}</time>` : ''}</div>
            </div>

            <section class="story-section" data-story-reveal="slide" aria-labelledby="story-chart-title">
                <h3 id="story-chart-title">${status === 'stable' ? '어떤 소리를 비교했나요?' : '달라진 구간을 찾아봤어요'}</h3>
                <p>${peakSentence(focus)}</p>
                ${graph ? `<div class="story-chart-card">
                    <div class="story-chart-tools">
                        <div class="story-legend"><span>기준음</span><span>비교음</span></div>
                        ${focus ? '<button class="story-zoom" type="button" data-story-zoom aria-pressed="false">대역 확대</button>' : ''}
                    </div>
                    <div class="story-chart-plot" data-story-chart>${graph}</div>
                    <p class="story-chart-unit">소리 레벨 (dBFS)</p>
                    ${focus ? `<div class="story-chart-focus">
                        <div><span>살펴본 주파수</span><strong>${hz(focus.hz)}</strong></div>
                        <div><span>기준 대비</span><strong>${db(focus.change)}</strong></div>
                    </div>` : ''}
                </div>` : ''}
            </section>

            <section class="story-section" data-story-reveal="zoom" aria-labelledby="story-meaning-title">
                <h3 id="story-meaning-title">이렇게 읽으면 돼요</h3>
                <p>${guidance(report, focus)}</p>
                ${report.rpmContext ? `<p class="story-rpm"><span>${icon('info', 17)}</span>${escape(report.rpmContext)}</p>` : ''}
                ${observations.length ? `<details class="story-details">
                    <summary>수치 근거 보기</summary>
                    <ul>${observations.map(item => `<li>${escape(item)}</li>`).join('')}</ul>
                </details>` : ''}
            </section>

            ${items.length ? `<section class="story-section" data-story-reveal="slide" aria-labelledby="story-check-title">
                <h3 id="story-check-title">다음 점검은 이렇게 해요</h3>
                <ol class="story-checks">${items.map((item, index) => `<li><span aria-hidden="true">${index + 1}</span><p>${escape(item)}</p></li>`).join('')}</ol>
            </section>` : ''}

            <section class="story-section story-questions" data-story-reveal="zoom" aria-labelledby="story-question-title">
                <h3 id="story-question-title">궁금한 점이 있나요?</h3>
                <div class="story-chip-list">${availableQuestions.map(({ label }, index) => `<button type="button"
                    class="story-chip" data-story-question="${index}" aria-pressed="false" aria-controls="story-answer">${escape(label)}</button>`).join('')}</div>
                <div id="story-answer" class="story-answer" hidden>
                    <p data-story-answer aria-hidden="true"></p>
                </div>
                <p class="story-sr-only" data-story-announcement role="status" aria-atomic="true"></p>
            </section>

            <div class="story-actions" data-story-reveal="slide">
                ${canRepeat ? `<button class="btn-primary" type="button" data-action="run-demo" data-id="${escape(report.deviceId)}">${icon('waveform', 19)} 다시 점검</button>` : ''}
                <button class="btn-secondary" type="button" data-action="download-report" data-id="${escape(report.id)}">${icon('download', 19)} 리포트 저장</button>
            </div>
        </article>`;
    }

    function mount(root, report) {
        const host = root.matches('[data-story-report]') ? root : root.querySelector('[data-story-report]');
        if (!host || !report) return () => {};
        const signal = readSignal(report);
        const answers = questions(report, signal.focus);
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        let animation = 0;
        let observer;

        if (!media.matches && 'IntersectionObserver' in window) {
            const scroller = host.closest('.sheet-body');
            observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    entry.target.classList.add('story-in-view');
                    observer.unobserve(entry.target);
                }
            }, { root: scroller, rootMargin: '0px 0px -5% 0px', threshold: .1 });
            host.classList.add('story-reveal-enabled');
            host.querySelectorAll('[data-story-reveal]').forEach(section => observer.observe(section));
        }

        function streamAnswer(answer) {
            cancelAnimationFrame(animation);
            const box = host.querySelector('#story-answer');
            const output = host.querySelector('[data-story-answer]');
            const announcement = host.querySelector('[data-story-announcement]');
            box.hidden = false;
            output.textContent = '';
            announcement.textContent = '';
            box.classList.toggle('is-answering', !media.matches);

            function finish() {
                animation = 0;
                output.textContent = answer;
                announcement.textContent = answer;
                box.classList.remove('is-answering');
            }
            if (media.matches) {
                finish();
                return;
            }
            const letters = Array.from(answer);
            const start = performance.now();
            const duration = Math.min(1450, letters.length * 14);

            function tick(now) {
                const fraction = Math.min(1, (now - start) / duration);
                if (fraction >= 1 || media.matches) {
                    finish();
                    return;
                }
                output.textContent = letters.slice(0, Math.max(1, Math.floor(letters.length * fraction))).join('');
                animation = requestAnimationFrame(tick);
            }
            animation = requestAnimationFrame(tick);
        }

        function onClick(event) {
            const chip = event.target.closest('[data-story-question]');
            if (chip && host.contains(chip)) {
                const picked = answers[Number(chip.dataset.storyQuestion)];
                if (!picked) return;
                host.querySelectorAll('[data-story-question]').forEach(button =>
                    button.setAttribute('aria-pressed', String(button === chip)));
                streamAnswer(picked.answer);
                return;
            }

            const zoom = event.target.closest('[data-story-zoom]');
            if (zoom && host.contains(zoom)) {
                const expanded = zoom.getAttribute('aria-pressed') === 'false';
                const plot = host.querySelector('[data-story-chart]');
                zoom.setAttribute('aria-pressed', String(expanded));
                zoom.textContent = expanded ? '전체 보기' : '대역 확대';
                plot.innerHTML = chart(signal, expanded);
            }
        }

        host.addEventListener('click', onClick);
        return () => {
            observer?.disconnect();
            cancelAnimationFrame(animation);
            host.removeEventListener('click', onClick);
        };
    }

    globalThis.StoryReport = { skeleton, render, mount };
})();
