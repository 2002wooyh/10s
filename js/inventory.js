(function (global) {
    'use strict';

    const modes = [['owned', '내 장비'], ['overall', '전체'], ['alerts', '알림']];
    const readKey = '10seconds:demo:inventory:read-v1';
    const formatDate = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' });
    const formatRecordDate = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const reduceMotion = global.matchMedia('(prefers-reduced-motion: reduce)');
    const ranks = { check: 3, attention: 2, stable: 0 };
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
    const icon = (name, size) => global.DemoIcon?.(name, size) ?? '';

    let root = null;
    let state = null;
    let mode = 'owned';
    let selectedId = null;
    let deck = null;
    let cards = [];
    let scrollFrame = 0;
    let settleTimer = 0;
    let detailTimer = 0;
    let detailObserver = null;
    let drag = null;
    let sizeObserver = null;
    let navigationIndex = null;
    let read = loadRead();

    function loadRead() {
        try {
            const ids = JSON.parse(localStorage.getItem(readKey) || '[]');
            return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []);
        } catch {
            return new Set();
        }
    }

    function markRead(ids) {
        ids.forEach(id => read.add(id));
        try {
            localStorage.setItem(readKey, JSON.stringify([...read]));
        } catch {
            // The current session can still display which notices were opened.
        }
    }

    function histories() {
        const byDevice = new Map(state.devices.map(device => [device.id, []]));
        for (const report of state.reports) {
            byDevice.get(report.deviceId)?.push(report);
        }
        for (const reports of byDevice.values()) {
            reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        return byDevice;
    }

    function alertReports() {
        return [...histories().values()].map(reports => reports[0]).filter(Boolean)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    function reportStatus(report) {
        return report && Object.hasOwn(ranks, report.status) ? report.status : 'pending';
    }

    function statusChip(report) {
        return `<span class="inventory-status ${reportStatus(report)}">${escape(report?.statusLabel || '미측정')}</span>`;
    }

    function displayDate(value, formatter = formatDate) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : formatter.format(date);
    }

    function monthCount(reports) {
        const now = new Date();
        const start = new Date(now);
        const day = start.getDate();
        start.setDate(1);
        start.setMonth(start.getMonth() - 1);
        const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
        start.setDate(Math.min(day, lastDay));
        return reports.filter(report => {
            const recorded = new Date(report.createdAt).getTime();
            return recorded >= start.getTime() && recorded <= now.getTime();
        }).length;
    }

    function image(device) {
        return /^assets\/equipment\/[^/\\]+\.png$/u.test(device.image)
            ? `<img src="${escape(device.image)}" alt="" draggable="false" decoding="async">`
            : `<span class="inventory-image-fallback" aria-hidden="true">${icon('devices', 56)}</span>`;
    }

    function empty(title, copy, action = '') {
        return `<div class="inventory-empty"><span class="inventory-empty-icon">${icon('devices', 24)}</span>
            <strong>${title}</strong><p>${copy}</p>${action}</div>`;
    }

    function card(device, index, report) {
        const clone = state.devices.length > 1 && (index < state.devices.length || index >= 2 * state.devices.length);
        return `<li class="inventory-card" data-device-id="${escape(device.id)}"${clone ? ' aria-hidden="true"' : ''}>
            <div class="inventory-card-image">${image(device)}${statusChip(report)}</div>
            <div class="inventory-card-caption"><strong>${escape(device.model || device.name)}</strong>
                ${device.category ? `<span>${escape(device.category)}</span>` : ''}</div></li>`;
    }

    function ownership() {
        if (!state.devices.length) return empty('등록한 장비가 없어요', '설비와 측정 위치를 추가하면 이 화면에서 확인할 수 있어요.',
            '<button class="btn-primary" type="button" data-action="add-device">장비 추가</button>');
        const reports = histories();
        const many = state.devices.length > 1;
        const devices = many ? [...state.devices, ...state.devices, ...state.devices] : state.devices;
        return `<div class="inventory-deck" aria-label="보유 장비 카드">
            <div class="inventory-deck-scroll" ${many ? 'tabindex="0" aria-keyshortcuts="ArrowLeft ArrowRight"' : ''} aria-label="가로로 넘겨 장비 선택">
                <ul class="inventory-card-track">${devices.map((device, index) => card(device, index, reports.get(device.id)[0])).join('')}</ul>
            </div>
            ${many ? '<span id="inventory-position" class="visually-hidden" role="status"></span>' : ''}
        </div><div id="inventory-details" class="inventory-details" aria-busy="false"></div>`;
    }

    function strongestPeak(report) {
        if (!report) return null;
        return report.peaks.reduce((strongest, peak) => {
            if (![peak?.hz, peak?.baseline, peak?.measured, peak?.change].every(Number.isFinite)) return strongest;
            return !strongest || Math.abs(peak.change) > Math.abs(strongest.change) ? peak : strongest;
        }, null);
    }

    function signedDb(value) {
        return (value > 0 ? '+' : '') + value.toFixed(1);
    }

    function evidenceMarkup(peak) {
        const levels = [['기준음', peak.baseline], ['이번 시연', peak.measured]];
        return `<div class="inventory-evidence">
            <div class="inventory-evidence-value"><strong>${signedDb(peak.change)} <small>dB</small></strong>
                <span>${peak.hz.toLocaleString('ko-KR')} Hz · 기준 대비 가장 큰 차이</span></div>
            <dl class="inventory-evidence-levels">${levels.map(([label, value]) => {
                const width = Math.min(100, Math.max(0, value + 100));
                return `<div><dt>${label}</dt><dd><span class="inventory-evidence-bar" aria-hidden="true" style="--level:${width}%"></span>
                    <strong>${value.toFixed(1)} dBFS</strong></dd></div>`;
            }).join('')}</dl></div>`;
    }

    function trendValues(latest, reports, peak) {
        return reports.flatMap(report => {
            if (report.point !== latest.point || report.model !== latest.model || report.rpm !== latest.rpm ||
                !Number.isFinite(Date.parse(report.createdAt))) return [];
            const match = report.peaks.find(item => item?.hz === peak.hz && Number.isFinite(item.change));
            return match ? [{ value: match.change, date: report.createdAt }] : [];
        }).slice(0, 6).reverse();
    }

    function trendMarkup(latest, reports, peak) {
        if (!peak) return '';
        const readings = trendValues(latest, reports, peak);
        const scope = latest.rpm ? '같은 장비·측정 위치·회전수에서 비교했어요.' : '같은 장비와 측정 위치의 시연값을 비교했어요.';
        let chart = '<p class="inventory-empty-copy">같은 위치와 주파수의 진단이 2회 이상 쌓이면 추이를 볼 수 있어요.</p>';
        if (readings.length >= 2) {
            const low = Math.min(0, ...readings.map(item => item.value));
            const high = Math.max(0, ...readings.map(item => item.value));
            const range = Math.max(high - low, 2);
            const bottom = low - Math.max(0, (2 - (high - low)) / 2);
            const y = value => +(82 - ((value - bottom) / range) * 68).toFixed(2);
            const points = readings.map((reading, index) => [10 + index * 280 / (readings.length - 1), y(reading.value)]);
            const label = readings.map(reading => `${displayDate(reading.date, formatRecordDate)} ${signedDb(reading.value)} dB`).join(', ');
            chart = `<figure class="inventory-trend-figure">
                <svg class="inventory-trend-chart" viewBox="0 0 300 96" role="img" aria-label="최근 ${readings.length}회 기준 대비 변화. ${escape(label)}">
                    <path class="inventory-trend-zero" d="M10 ${y(0)} H290"/>
                    <polyline class="inventory-trend-line" points="${points.map(point => point.join(',')).join(' ')}"/>
                    ${points.map(([x, y]) => `<circle class="inventory-trend-point" cx="${x}" cy="${y}" r="3.5"/>`).join('')}
                </svg>
                <figcaption class="inventory-trend-caption">${readings.map((reading, index) => `<span><strong>${signedDb(reading.value)} dB</strong>
                    <small>${escape(displayDate(reading.date))}${readings.filter(item => displayDate(item.date) === displayDate(reading.date)).length > 1 ? ` · ${index + 1}번째` : ''}</small></span>`).join('')}</figcaption>
            </figure>`;
        }
        return `<section class="inventory-story-panel inventory-trend" data-inventory-reveal>
            <h3>${peak.hz.toLocaleString('ko-KR')} Hz 변화 추이</h3><p class="inventory-story-caption">${scope}</p>${chart}</section>`;
    }

    function checksMarkup(report) {
        if (!report || !report.nextChecks.length) return '';
        return `<section class="inventory-story-panel inventory-checks" data-inventory-reveal>
            <div class="inventory-story-heading"><span class="inventory-row-icon">${icon('check', 20)}</span><h3>다음 점검에서 확인할 것</h3></div>
            <ol>${report.nextChecks.map(check => `<li>${escape(check)}</li>`).join('')}</ol>
            ${report.rpmContext ? `<p class="inventory-story-caption inventory-check-context">${escape(report.rpmContext)}</p>` : ''}
        </section>`;
    }

    function detailsMarkup(device, reports) {
        const latest = reports[0];
        const peak = strongestPeak(latest);
        const facts = [['모델', device.model], ['측정 위치', device.point],
            ['기준 회전수', device.rpm ? device.rpm.toLocaleString('ko-KR') + ' rpm' : '']].filter(([, value]) => value);
        return `<section class="inventory-device-overview">
                <div class="inventory-device-heading"><h2>${escape(device.name)}</h2>${statusChip(latest)}</div>
                <p class="inventory-category">${escape(device.category)}</p>
                <dl class="inventory-specs">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
            </section>
            <section class="inventory-activity" aria-label="진단 활동"><dl>
                <div><dt>최근 1개월 진단</dt><dd>${monthCount(reports)}<small>회</small></dd></div>
                <div><dt>마지막 진단</dt><dd>${latest ? escape(displayDate(latest.createdAt)) : '기록 없음'}</dd></div>
            </dl></section>
            <section class="inventory-summary">
                <div class="inventory-summary-heading"><h3>최근 분석 요약</h3>${latest ? '<span>시연 결과</span>' : ''}</div>
                <p>${latest ? escape(latest.summary) : '이 장비는 아직 저장된 시연 분석이 없어요.'}</p>
                ${peak ? evidenceMarkup(peak) : ''}
                ${latest ? `<button class="inventory-text-button" type="button" data-action="open-report" data-id="${escape(latest.id)}">최근 리포트 보기 ${icon('chevron', 16)}</button>` : ''}
            </section>
            ${trendMarkup(latest, reports, peak)}${checksMarkup(latest)}
            <section class="inventory-history" data-inventory-reveal><div class="inventory-section-heading"><h3>진단 기록</h3>
                <span>전체 <strong>${reports.length}건</strong></span></div>
                ${reports.length ? `<ul class="inventory-list">${reports.map(report => `<li><button type="button" class="inventory-history-row" data-action="open-report" data-id="${escape(report.id)}">
                    <span class="inventory-row-icon">${icon('reports', 19)}</span><span class="inventory-row-copy"><strong>가동음 시연 리포트</strong>
                    <small>${escape(displayDate(report.createdAt, formatRecordDate))} · ${escape(report.point)}</small></span>
                    ${statusChip(report)}${icon('chevron', 16)}</button></li>`).join('')}</ul>` : '<p class="inventory-empty-copy">진단을 완료하면 이곳에 기록이 쌓여요.</p>'}
            </section>`;
    }

    function plant() {
        if (!state.devices.length) return empty('공장 현황을 준비하고 있어요', '장비를 등록하고 점검을 진행하면 관리 우선순위가 표시돼요.');
        const reports = histories();
        const devices = state.devices.map(device => ({ device, report: reports.get(device.id)[0] }));
        const attention = devices.filter(({ report }) => report && ranks[report.status] > 0)
            .sort((a, b) => ranks[b.report.status] - ranks[a.report.status] || b.report.createdAt.localeCompare(a.report.createdAt));
        const replacementReview = attention.find(({ report }) => report.status === 'check');
        const pending = devices.filter(({ report }) => !report);
        const latestChecks = attention.map(({ device, report }) => `<li class="inventory-priority-card">
            <div class="inventory-priority-head"><strong>${escape(device.name)}</strong>${statusChip(report)}</div>
            <p>${escape(report.summary)}</p><span class="inventory-priority-point">확인 위치 · ${escape(report.point)}</span>
            ${report.nextChecks[0] ? `<span class="inventory-priority-note">${escape(report.nextChecks[0])}</span>` : ''}
            <button type="button" class="inventory-text-button" data-action="open-report" data-id="${escape(report.id)}">근거 리포트 보기 ${icon('chevron', 16)}</button></li>`);
        return `<div class="inventory-plant">
            <section class="inventory-plant-overview"><h2>공장 전체 현황</h2><p>장비별 최근 시연 리포트를 기준으로 정리했어요.</p>
                <dl class="inventory-metrics"><div><dt>등록 장비</dt><dd>${devices.length}<span>대</span></dd></div>
                    <div><dt>확인 우선</dt><dd>${attention.length}<span>대</span></dd></div>
                    <div><dt>미측정</dt><dd>${pending.length}<span>대</span></dd></div></dl></section>
            <section class="inventory-replace"><span class="inventory-row-icon">${icon('info', 19)}</span><div><h3>교체 검토 우선 위치</h3>
                ${replacementReview ? `<p><strong>${escape(replacementReview.device.name)} · ${escape(replacementReview.report.point)}</strong></p>` : ''}
                <p>${replacementReview ? '이 위치부터 같은 조건으로 재점검해 보세요. 변화가 반복되면 부품 상태와 정비 이력을 함께 확인해요.' : '현재 교체 검토가 우선인 위치는 없어요.'}</p></div></section>
            <section><div class="inventory-section-heading"><h3>먼저 확인할 장비</h3></div>
                ${attention.length ? `<ul class="inventory-list inventory-priorities">${latestChecks.join('')}</ul>` : '<p class="inventory-empty-copy">지금 확인 우선으로 분류된 장비가 없어요.</p>'}
            </section>
            ${pending.length ? `<section><div class="inventory-section-heading"><h3>첫 진단이 필요한 장비</h3></div>
                <ul class="inventory-list inventory-pending">${pending.map(({ device }) => `<li><button type="button" data-inventory-device="${escape(device.id)}">
                    <span>${escape(device.name)}</span>${icon('chevron', 16)}</button></li>`).join('')}</ul></section>` : ''}
            </div>`;
    }

    function alerts() {
        const reports = alertReports();
        if (!reports.length) return empty('아직 알림이 없어요', '새 진단 결과가 저장되면 장비별 알림이 표시돼요.');
        return `<div class="inventory-alerts"><div class="inventory-section-heading"><h2>진단 알림</h2>
            <button type="button" class="inventory-text-button" data-inventory-read-all${reports.every(report => read.has(report.id)) ? ' disabled' : ''}>모두 읽음</button></div>
            <ul class="inventory-list">${reports.map(report => `<li><button type="button" class="inventory-alert ${reportStatus(report)}" data-action="open-report" data-id="${escape(report.id)}" data-inventory-alert>
                <span class="inventory-row-icon">${icon(report.status === 'stable' ? 'check' : 'waveform', 22)}</span>
                <span class="inventory-alert-copy"><span class="inventory-alert-title"><strong>${escape(report.deviceName)}</strong>${read.has(report.id) ? '' : '<span class="inventory-alert-dot" aria-label="새 알림"></span>'}</span>
                    <span>${escape(report.statusLabel)} · ${escape(report.point)}</span><small>${escape(displayDate(report.createdAt))}</small></span>
                ${icon('chevron', 17)}</button></li>`).join('')}</ul></div>`;
    }

    function tabMarkup() {
        const unread = alertReports().filter(report => !read.has(report.id)).length;
        return modes.map(([id, label]) => `<button type="button" role="tab" id="inventory-tab-${id}" aria-selected="${mode === id}" tabindex="${mode === id ? '0' : '-1'}"
            aria-controls="inventory-content" data-inventory-tab="${id}">${label}${id === 'alerts' && unread ? `<span class="inventory-tab-count">${unread}</span>` : ''}</button>`).join('');
    }

    function stopScroll() {
        global.clearTimeout(settleTimer);
        global.cancelAnimationFrame(scrollFrame);
        cancelDetails();
        stopDetailReveal();
        scrollFrame = 0;
        sizeObserver?.disconnect();
        sizeObserver = null;
        navigationIndex = null;
        deck = null;
        cards = [];
        drag = null;
    }

    function draw({ keepScroll = false } = {}) {
        if (!root || !state) return;
        const scrollTop = keepScroll ? root.scrollTop : 0;
        stopScroll();
        root.innerHTML = `<header class="inventory-header"><div class="inventory-title-row"><h1>내 장비</h1>
            <button type="button" class="inventory-icon-button inventory-add" data-action="add-device" aria-label="장비 추가">${icon('plus', 22)}</button></div>
            <div class="inventory-tabs" role="tablist" aria-label="장비 현황 보기">${tabMarkup()}</div></header>
            <div class="inventory-content" id="inventory-content" role="tabpanel" aria-labelledby="inventory-tab-${mode}">
                ${mode === 'owned' ? ownership() : mode === 'overall' ? plant() : alerts()}</div>`;
        if (mode === 'owned' && state.devices.length) attachDeck();
        root.scrollTop = scrollTop;
    }

    function cancelDetails() {
        global.clearTimeout(detailTimer);
        detailTimer = 0;
    }

    function stopDetailReveal() {
        detailObserver?.disconnect();
        detailObserver = null;
    }

    function observeDetails(details) {
        if (reduceMotion.matches || typeof IntersectionObserver !== 'function') return;
        detailObserver = new IntersectionObserver((entries, observer) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                entry.target.classList.remove('inventory-scroll-pending');
                entry.target.classList.add('inventory-scroll-entered');
                observer.unobserve(entry.target);
            }
        }, { root, rootMargin: '0px 0px -14px' });
        for (const section of details.querySelectorAll('[data-inventory-reveal]')) {
            section.classList.add('inventory-scroll-pending');
            detailObserver.observe(section);
        }
    }

    function detailSkeleton() {
        return `<div class="inventory-detail-skeleton" aria-hidden="true">
            <div class="inventory-skeleton-line heading"></div><div class="inventory-skeleton-line short"></div>
            <div class="inventory-skeleton-specs"><span></span><span></span><span></span></div>
            <div class="inventory-skeleton-summary"><div class="inventory-skeleton-line short"></div>
                <div class="inventory-skeleton-line"></div><div class="inventory-skeleton-line medium"></div></div>
            <div class="inventory-skeleton-line heading"></div><div class="inventory-skeleton-row"></div>
        </div>`;
    }

    function showDevice(id, transition = false) {
        const device = state.devices.find(item => item.id === id);
        const details = root.querySelector('#inventory-details');
        if (!device || !details) return;
        cancelDetails();
        stopDetailReveal();
        selectedId = id;
        const index = state.devices.indexOf(device);
        const position = root.querySelector('#inventory-position');
        if (position) position.textContent = `${device.name}, ${state.devices.length}대 중 ${index + 1}번째`;

        function paint(reveal) {
            details.classList.toggle('is-revealing', reveal);
            details.innerHTML = detailsMarkup(device, histories().get(id));
            details.setAttribute('aria-busy', 'false');
            observeDetails(details);
        }

        if (!transition || reduceMotion.matches || document.hidden) {
            paint(false);
            return;
        }

        details.classList.remove('is-revealing');
        details.setAttribute('aria-busy', 'true');
        details.innerHTML = detailSkeleton();
        const scheduledDeck = deck;
        detailTimer = global.setTimeout(() => {
            detailTimer = 0;
            if (deck !== scheduledDeck || mode !== 'owned' || root.hidden || selectedId !== id ||
                cards[nearestCard()]?.dataset.deviceId !== id) return;
            paint(!reduceMotion.matches && !document.hidden);
        }, 280);
    }

    function cardLeft(index) {
        const card = cards[index];
        const offset = card.offsetLeft + card.offsetWidth / 2 - deck.clientWidth / 2;
        return Math.min(Math.max(0, offset), deck.scrollWidth - deck.clientWidth);
    }

    function nearestCard() {
        if (!deck || !cards.length) return 0;
        const width = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0;
        if (!width) return 0;
        return Math.max(0, Math.min(cards.length - 1, Math.round((deck.scrollLeft - cardLeft(0)) / width)));
    }

    function syncCards() {
        const index = nearestCard();
        const center = cards[index];
        if (!center) return;
        if (!center.classList.contains('is-centered')) {
            deck.querySelector('.is-centered')?.classList.remove('is-centered');
            center.classList.add('is-centered');
        }
    }

    function moveTo(index, animate = false) {
        if (!deck?.clientWidth || !cards[index]) return;
        deck.scrollTo({ left: cardLeft(index), behavior: animate && !reduceMotion.matches ? 'smooth' : 'instant' });
        if (!animate || reduceMotion.matches) syncCards();
    }

    function settle() {
        if (!deck?.clientWidth || root.hidden || drag || state.devices.length < 2) return;
        if (navigationIndex !== null && Math.abs(deck.scrollLeft - cardLeft(navigationIndex)) > 3) return;
        navigationIndex = null;
        const count = state.devices.length;
        const index = nearestCard();
        const id = cards[index].dataset.deviceId;
        if (index < count || index >= count * 2) moveTo(count + (index % count));
        const busy = root.querySelector('#inventory-details')?.getAttribute('aria-busy') === 'true';
        if (selectedId !== id || (busy && !detailTimer)) showDevice(id, true);
    }

    function onScroll() {
        if (!scrollFrame) scrollFrame = global.requestAnimationFrame(() => {
            scrollFrame = 0;
            syncCards();
            if (detailTimer && cards[nearestCard()]?.dataset.deviceId !== selectedId) cancelDetails();
        });
        global.clearTimeout(settleTimer);
        settleTimer = global.setTimeout(settle, 145);
    }

    function step(direction) {
        if (!deck || cards.length < 2) return;
        cancelDetails();
        let index = navigationIndex ?? nearestCard();
        if (!cards[index + direction]) {
            index = state.devices.length + index % state.devices.length;
            moveTo(index);
        }
        navigationIndex = index + direction;
        moveTo(navigationIndex, true);
        if (reduceMotion.matches) settle();
    }

    function startDrag(event) {
        if (event.pointerType !== 'mouse' || event.button !== 0 || state.devices.length < 2) return;
        navigationIndex = null;
        drag = { id: event.pointerId, x: event.clientX, start: deck.scrollLeft, moved: false,
            target: event.target.closest('.inventory-card') };
        deck.setPointerCapture(event.pointerId);
        deck.classList.add('is-dragging');
    }

    function dragDeck(event) {
        if (drag?.id !== event.pointerId) return;
        const delta = event.clientX - drag.x;
        if (Math.abs(delta) > 6) drag.moved = true;
        if (drag.moved) deck.scrollLeft = drag.start - delta;
    }

    function endDrag(event) {
        if (drag?.id !== event.pointerId) return;
        const target = event.type === 'pointerup' && !drag.moved ? cards.indexOf(drag.target) : -1;
        drag = null;
        deck.classList.remove('is-dragging');
        moveTo(target >= 0 ? target : nearestCard(), true);
        if (reduceMotion.matches) settle();
    }

    function attachDeck() {
        deck = root.querySelector('.inventory-deck-scroll');
        cards = [...deck.querySelectorAll('.inventory-card')];
        const chosen = Math.max(0, state.devices.findIndex(device => device.id === selectedId));
        showDevice(state.devices[chosen].id);
        moveTo(state.devices.length > 1 ? state.devices.length + chosen : chosen);
        deck.addEventListener('scroll', onScroll, { passive: true });
        deck.addEventListener('scrollend', () => {
            global.clearTimeout(settleTimer);
            settle();
        });
        deck.addEventListener('pointerdown', startDrag);
        deck.addEventListener('pointermove', dragDeck);
        deck.addEventListener('pointerup', endDrag);
        deck.addEventListener('pointercancel', endDrag);
        deck.addEventListener('lostpointercapture', endDrag);
        deck.addEventListener('touchstart', () => { navigationIndex = null; }, { passive: true });
        deck.addEventListener('wheel', event => { if (event.deltaX) navigationIndex = null; }, { passive: true });
        deck.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            step(event.key === 'ArrowLeft' ? -1 : 1);
        });
        if (typeof ResizeObserver === 'function') {
            let width = deck.clientWidth;
            sizeObserver = new ResizeObserver(() => {
                if (!deck?.clientWidth || deck.clientWidth === width) return;
                width = deck.clientWidth;
                navigationIndex = null;
                global.clearTimeout(settleTimer);
                const position = Math.max(0, state.devices.findIndex(device => device.id === selectedId));
                const details = root.querySelector('#inventory-details');
                if (details?.getAttribute('aria-busy') === 'true') showDevice(state.devices[position].id);
                moveTo(state.devices.length > 1 ? state.devices.length + position : position);
            });
            sizeObserver.observe(deck);
        }
    }

    function handleClick(event) {
        const button = event.target.closest('button');
        if (!button || !root.contains(button)) return;
        const { inventoryTab, inventoryDevice, id } = button.dataset;
        if (inventoryTab && mode !== inventoryTab) {
            mode = inventoryTab;
            draw();
            root.querySelector(`[data-inventory-tab="${mode}"]`)?.focus({ preventScroll: true });
        } else if (inventoryDevice) {
            selectedId = inventoryDevice;
            mode = 'owned';
            draw();
        } else if (button.hasAttribute('data-inventory-read-all')) {
            markRead(alertReports().map(report => report.id));
            draw({ keepScroll: true });
            root.querySelector('#inventory-tab-alerts')?.focus({ preventScroll: true });
        } else if (button.hasAttribute('data-inventory-alert') && id) {
            markRead([id]);
            button.querySelector('.inventory-alert-dot')?.remove();
            const tabs = root.querySelector('.inventory-tabs');
            tabs.innerHTML = tabMarkup();
            root.querySelector('[data-inventory-read-all]').disabled = alertReports().every(report => read.has(report.id));
        }
    }

    function handleTabKeys(event) {
        const target = event.target.closest('[data-inventory-tab]');
        if (!target || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = modes.findIndex(([id]) => id === target.dataset.inventoryTab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1
            : (index + (event.key === 'ArrowLeft' ? -1 : 1) + modes.length) % modes.length;
        mode = modes[next][0];
        draw();
        root.querySelector(`[data-inventory-tab="${mode}"]`)?.focus({ preventScroll: true });
    }

    function render(element, nextState) {
        if (root !== element) {
            dispose();
            root = element;
            root.addEventListener('click', handleClick);
            root.addEventListener('keydown', handleTabKeys);
        }
        const keepScroll = state === nextState;
        state = nextState;
        draw({ keepScroll });
    }

    function refresh(nextState) {
        if (root) render(root, nextState);
    }

    function focusDevice(id) {
        selectedId = id;
        if (root?.clientWidth && state && mode === 'owned') draw({ keepScroll: true });
    }

    function dispose() {
        root?.removeEventListener('click', handleClick);
        root?.removeEventListener('keydown', handleTabKeys);
        stopScroll();
        root = null;
        state = null;
    }

    global.DemoInventory = { render, refresh, focusDevice, dispose };
})(globalThis);
