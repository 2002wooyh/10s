(() => {
    'use strict';

    const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
    const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
    const icon = (name, size) => globalThis.DemoIcon?.(name, size) || '';
    const hz = value => number.format(value) + ' Hz';
    const db = value => (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
    function readSignal(report) {
        const valid = point => point && Number.isFinite(point.hz) &&
            Number.isFinite(point.baseline) && Number.isFinite(point.measured);
        const points = (Array.isArray(report.spectrum) ? report.spectrum : []).filter(valid)
            .sort((a, b) => a.hz - b.hz);
        const first = points[0]?.hz;
        const last = points.at(-1)?.hz;
        const hasRange = points.length > 1 && first < last;
        const samples = (Array.isArray(report.peaks) ? report.peaks : []).filter(point =>
            valid(point) && (!hasRange || (point.hz >= first && point.hz <= last)));
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
        const span = maxHz - minHz;
        const zoomHalfWidth = Math.min(Math.max(26, span * .055), span * .45);
        const start = zoom && focus ? Math.max(minHz, focus.hz - zoomHalfWidth) : minHz;
        const end = zoom && focus ? Math.min(maxHz, focus.hz + zoomHalfWidth) : maxHz;
        // Include the adjacent samples so the visible traces meet the viewport edges.
        const first = Math.max(0, points.findIndex(point => point.hz >= start) - 1);
        const last = points.findIndex(point => point.hz > end);
        const visible = points.slice(first, last === -1 ? undefined : last + 1);
        const levels = visible.flatMap(point => [point.baseline, point.measured]);
        if (focus) levels.push(focus.baseline, focus.measured);
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

    function skeleton(message = 'AI 분석 리포트를 준비하고 있어요.') {
        return `<div class="story-skeleton" role="status">
            <span class="story-sr-only">${escape(message)}</span>
            <div class="story-skeleton-identity" aria-hidden="true">
                <div><i></i><i></i><i></i></div><i class="story-skeleton-photo"></i>
            </div>
            <div class="story-skeleton-hero" aria-hidden="true">
                <i></i><i></i><i></i><i></i>
            </div>
            <div class="story-skeleton-section" aria-hidden="true">
                <i></i><i class="story-skeleton-chart"></i>
            </div>
        </div>`;
    }

    function peakSentence(peak) {
        if (!peak) return '표시할 수 있는 주파수 정보가 아직 없어요.';
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

    function render(saved, { canRepeat = true, image = '' } = {}) {
        if (!saved) return '<div class="empty-state"><strong>리포트를 찾을 수 없습니다</strong></div>';
        const report = globalThis.TenData.reportForDisplay(saved);
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
        const graph = chart(data);
        const chartTitle = !focus ? '주파수 비교'
            : status === 'stable' ? '어떤 소리를 비교했나요?' : '달라진 구간을 찾아봤어요';
        const availableQuestions = [
            focus ? `왜 ${hz(focus.hz)}를 봤나요?` : '기준음은 어떻게 비교하나요?',
            '다음 점검에서 뭘 확인해요?'
        ];
        const hasPhoto = /^assets\/equipment\/[^/\\]+\.png$/u.test(image) || globalThis.TenData?.isDevicePhoto?.(image);

        return `<article class="story-report" data-story-report aria-label="장비 가동음 AI 분석 리포트">
            <header class="story-identity${hasPhoto ? ' has-photo' : ''}">
                <div class="story-identity-copy"><h2 class="story-device">${escape(report.deviceName)}</h2>
                    ${report.model ? `<p class="story-model">${escape(report.model)}</p>` : ''}
                    ${report.point ? `<p class="story-identity-meta">${escape(report.point)}</p>` : ''}
                    ${dateText ? `<time datetime="${escape(report.createdAt)}">${escape(dateText)}</time>` : ''}</div>
                ${hasPhoto ? `<span class="story-identity-photo"><img src="${escape(image)}" alt="" decoding="async"></span>` : ''}
            </header>
            <section class="story-hero" aria-labelledby="story-title">
                <div class="story-hero-top">
                    <span class="story-label">가동음 비교</span>
                    <span class="story-status-icon" aria-hidden="true">${icon(status === 'stable' ? 'check' : 'waveform', 19)}</span>
                </div>
                <h3 id="story-title">${headline}</h3>
                <p class="story-lead">${escape(report.summary)}</p>
            </section>

            <section class="story-section" data-story-reveal="slide" aria-labelledby="story-chart-title">
                <h3 id="story-chart-title">${chartTitle}</h3>
                <p>${peakSentence(focus)}</p>
                ${graph ? `<figure class="story-chart-card">
                    <div class="story-chart-tools">
                        <div class="story-legend"><span>기준음</span><span>비교음</span></div>
                        ${focus ? '<button class="story-zoom" type="button" data-story-zoom aria-pressed="false">대역 확대</button>' : ''}
                    </div>
                    <p class="story-chart-unit">소리 레벨 (dBFS)</p>
                    <div class="story-chart-plot" data-story-chart>${graph}</div>
                    ${focus ? `<figcaption class="story-chart-focus">
                        <div><span>살펴본 주파수</span><strong>${hz(focus.hz)}</strong></div>
                        <div><span>기준 대비</span><strong>${db(focus.change)}</strong></div>
                    </figcaption>` : ''}
                </figure>` : ''}
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

            <div class="story-actions" data-story-reveal="slide">
                ${canRepeat ? `<button class="btn-primary" type="button" data-action="remeasure" data-id="${escape(report.deviceId)}">${icon('waveform', 19)} 다시 측정</button>` : ''}
                <button class="btn-secondary" type="button" data-action="download-report" data-id="${escape(report.id)}">${icon('download', 19)} 리포트 저장</button>
            </div>
            ${globalThis.ReportChat.questions({ id: 'story-question-title', questions: availableQuestions })}
        </article>`;
    }

    function mount(root, { report, onQuestion }) {
        const host = root.matches('[data-story-report]') ? root : root.querySelector('[data-story-report]');
        if (!host || !report) return () => {};
        const signal = readSignal(report);
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const unbindQuestions = globalThis.ReportChat.bindQuestions(
            host.querySelector('[data-report-chat-questions]'), onQuestion
        );
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

        function onClick(event) {
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
            unbindQuestions();
            host.removeEventListener('click', onClick);
        };
    }

    globalThis.StoryReport = { skeleton, render, mount };
})();
