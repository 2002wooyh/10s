(function (global) {
    'use strict';

    const formatDate = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' });
    const formatRecordDate = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const reduceMotion = global.matchMedia('(prefers-reduced-motion: reduce)');
    const statuses = ['check', 'attention', 'stable'];
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
    const icon = (name, size) => global.DemoIcon?.(name, size) ?? '';

    let root = null;
    let state = null;
    let selectedId = null;
    let deck = null;
    let cards = [];
    let scrollFrame = 0;
    let settleTimer = 0;
    let drag = null;
    let touchX = null;
    let suppressPointerClick = false;
    let sizeObserver = null;
    let navigationIndex = null;

    function histories(data) {
        const byDevice = new Map(data.devices.map(device => [device.id, []]));
        for (const report of data.reports) {
            byDevice.get(report.deviceId)?.push(global.TenData.reportForDisplay(report));
        }
        for (const reports of byDevice.values()) {
            reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        return byDevice;
    }

    function reportStatus(report) {
        return statuses.includes(report?.status) ? report.status : 'pending';
    }

    function statusChip(report) {
        const status = report ? reportStatus(report) : 'stable';
        return `<span class="inventory-status ${status}">${escape(report?.statusLabel || '정상')}</span>`;
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
        const source = device.image;
        const valid = typeof source === 'string' &&
            (/^assets\/equipment\/[^/\\]+\.png$/u.test(source) || global.TenData?.isDevicePhoto?.(source));
        return valid
            ? `<img src="${escape(source)}" alt="" draggable="false" decoding="async">`
            : `<span class="inventory-image-fallback" aria-hidden="true">${icon('devices', 56)}</span>`;
    }

    function empty(title, copy, action = '') {
        return `<div class="inventory-empty"><span class="inventory-empty-icon">${icon('devices', 24)}</span>
            <strong>${title}</strong><p>${copy}</p>${action}</div>`;
    }

    function card(device, index, report) {
        const clone = state.devices.length > 1 && (index < state.devices.length || index >= 2 * state.devices.length);
        const title = device.model || device.name;
        return `<li class="inventory-card" data-device-id="${escape(device.id)}"${clone ? ' aria-hidden="true"' : ''}>
            <button type="button" class="inventory-card-button" data-action="device-story" data-id="${escape(device.id)}" tabindex="-1"
                aria-label="${escape(title)} 상세 보기">
                <span class="inventory-card-image">${image(device)}${statusChip(report)}</span>
                <span class="inventory-card-caption"><strong>${escape(title)}</strong>
                    ${device.category && device.category !== title ? `<span>${escape(device.category)}</span>` : ''}${icon('chevron', 18)}</span>
            </button></li>`;
    }

    function ownership() {
        if (!state.devices.length) return empty('등록한 장비가 없어요', '장비를 추가하면 이 화면에서 확인할 수 있어요.',
            '<button class="btn-primary" type="button" data-action="add-device">장비 추가</button>');
        const reports = histories(state);
        const many = state.devices.length > 1;
        const devices = many ? [...state.devices, ...state.devices, ...state.devices] : state.devices;
        return `<div class="inventory-deck" aria-label="보유 장비 카드">
            <div class="inventory-deck-scroll" ${many ? 'tabindex="0" aria-keyshortcuts="ArrowLeft ArrowRight Enter"' : ''} aria-label="가로로 넘겨 장비 선택">
                <ul class="inventory-card-track">${devices.map((device, index) =>
                    card(device, index, reports.get(device.id).find(report => sameModel(report, device)))).join('')}</ul>
            </div>
            ${many ? '<span id="inventory-position" class="visually-hidden" role="status"></span>' : ''}
        </div>`;
    }

    function sameModel(report, device) {
        return (report.model || '') === device.model;
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
        const levels = [['기준값', peak.baseline], ['비교값', peak.measured]];
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
        const scope = latest.rpm ? '같은 장비·측정 위치·회전수의 비교값을 모았어요.' : '같은 장비와 측정 위치의 비교값을 모았어요.';
        let chart = '<p class="inventory-empty-copy">같은 위치와 주파수의 점검 기록이 2회 이상 쌓이면 추이를 볼 수 있어요.</p>';
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

    function latestReport(device, data) {
        return (histories(data).get(device.id) ?? []).find(report => sameModel(report, device));
    }

    function historyList(reports, device) {
        return `<ul class="inventory-list">${reports.map(report => `<li><button type="button" class="inventory-history-row" data-action="open-report" data-id="${escape(report.id)}">
            <span class="inventory-row-icon">${icon('reports', 19)}</span><span class="inventory-row-copy"><strong>AI 분석 리포트</strong>
            <small>${escape(displayDate(report.createdAt, formatRecordDate))} · ${escape(report.point)}</small>
            ${!sameModel(report, device) && report.model ? `<small>이전 모델 · ${escape(report.model)}</small>` : ''}</span>
            ${statusChip(report)}${icon('chevron', 16)}</button></li>`).join('')}</ul>`;
    }

    function detailStory(device, data, { historyExpanded = false } = {}) {
        const reports = histories(data).get(device.id) ?? [];
        const recentReports = reports.slice(0, 3);
        const olderReports = reports.slice(3);
        const currentReports = reports.filter(report => sameModel(report, device));
        const latest = currentReports[0];
        const peak = strongestPeak(latest);
        const category = device.category === device.name ? '' : device.category;
        const subtitle = device.model || category;
        const notes = typeof device.details === 'string' ? device.details.trim() : '';
        const questions = [
            '어디에서 소리를 측정하나요?',
            latest ? '최근 분석은 어땠나요?' : '첫 점검은 어떻게 시작하나요?'
        ];
        const facts = [['모델', device.model], ['측정 위치', device.point],
            ['비교 기준 회전수', device.rpm ? device.rpm.toLocaleString('ko-KR') + ' rpm' : '']].filter(([, value]) => value);
        return `<article class="inventory-details inventory-detail-story">
            <header class="inventory-story-hero">
                <div class="inventory-hero-copy"><h2>${escape(device.name)}</h2>
                    ${subtitle ? `<p>${escape(subtitle)}</p>` : ''}${statusChip(latest)}</div>
                <div class="inventory-hero-image" aria-hidden="true">${image(device)}</div>
            </header>
            <section class="inventory-summary">
                <div class="inventory-summary-heading"><h3>최근 AI 분석 리포트</h3></div>
                <p>${latest ? escape(latest.summary) : reports.length ? '현재 모델의 분석 기록이 아직 없어요.' : '이 장비는 아직 저장된 분석 결과가 없어요.'}</p>
                ${peak ? evidenceMarkup(peak) : ''}
                ${latest ? `<button class="inventory-text-button" type="button" data-action="open-report" data-id="${escape(latest.id)}">${latest.recording ? '녹음과 분석 보기' : '최근 리포트 보기'} ${icon('chevron', 16)}</button>` : ''}
            </section>
            <section class="inventory-device-overview inventory-story-panel" data-inventory-reveal>
                <h3>장비 사양과 측정 조건</h3>${category ? `<p class="inventory-category">${escape(category)}</p>` : ''}
                ${facts.length ? `<dl class="inventory-specs">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : ''}
                ${notes ? `<div class="inventory-device-note"><h4>장비 설명</h4><p>${escape(notes)}</p></div>` : ''}
            </section>
            <section class="inventory-activity" aria-label="점검 현황" data-inventory-reveal><dl>
                <div><dt>최근 1개월 점검</dt><dd>${monthCount(currentReports)}<small>회</small></dd></div>
                <div><dt>마지막 점검</dt><dd>${escape(latest && displayDate(latest.createdAt) || '기록 없음')}</dd></div>
            </dl></section>
            ${trendMarkup(latest, currentReports, peak)}${checksMarkup(latest)}
            <section class="inventory-history" data-inventory-reveal><div class="inventory-section-heading"><h3>점검 기록</h3>
                <span>전체 <strong>${reports.length}건</strong></span></div>
                ${recentReports.length ? historyList(recentReports, device) : '<p class="inventory-empty-copy">점검을 완료하면 이곳에서 리포트를 볼 수 있어요.</p>'}
                ${olderReports.length ? `<details class="inventory-history-more" data-inventory-history-more${historyExpanded ? ' open' : ''}>
                    <summary><span class="inventory-history-expand">더보기</span><span class="inventory-history-collapse">접기</span>${icon('chevron', 16)}</summary>
                    ${historyList(olderReports, device)}
                </details>` : ''}
            </section>
            ${global.ReportChat.questions({ id: 'inventory-questions-title', questions })}
        </article>`;
    }

    function mountStory(container, scrollRoot = container) {
        if (reduceMotion.matches || typeof IntersectionObserver !== 'function') return () => {};
        const sections = [...container.querySelectorAll('.inventory-detail-story [data-inventory-reveal]')];
        const observer = new IntersectionObserver((entries, observer) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                entry.target.classList.add('inventory-scroll-entered');
                observer.unobserve(entry.target);
            }
        }, { root: scrollRoot, rootMargin: '0px 0px -14px' });
        sections.forEach(section => observer.observe(section));
        return () => observer.disconnect();
    }

    function stopScroll() {
        global.clearTimeout(settleTimer);
        global.cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
        sizeObserver?.disconnect();
        sizeObserver = null;
        navigationIndex = null;
        deck = null;
        cards = [];
        drag = null;
        touchX = null;
        suppressPointerClick = false;
    }

    function draw() {
        stopScroll();
        root.innerHTML = '<header class="inventory-header"><h1>내 장비</h1></header>' +
            '<div class="inventory-content">' + ownership() + '</div>';
        if (state.devices.length) attachDeck();
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
        const center = cards[nearestCard()];
        if (!center || center.classList.contains('is-centered')) return;
        deck.querySelector('.is-centered')?.classList.remove('is-centered');
        center.classList.add('is-centered');
    }

    function moveTo(index, animate = false) {
        if (!deck?.clientWidth || !cards[index]) return;
        deck.scrollTo({ left: cardLeft(index), behavior: animate && !reduceMotion.matches ? 'smooth' : 'instant' });
        if (!animate || reduceMotion.matches) syncCards();
    }

    function canonicalIndex(index) {
        const count = state.devices.length;
        return count > 1 ? count + (index % count) : index;
    }

    function selectCard(index, keepFocus = false) {
        const previous = deck.querySelector('.inventory-card-button[tabindex="0"]');
        const button = cards[index].querySelector('.inventory-card-button');
        if (previous !== button) {
            const restoreFocus = keepFocus && previous === document.activeElement;
            if (previous) previous.tabIndex = -1;
            button.tabIndex = 0;
            if (restoreFocus) button.focus({ preventScroll: true });
        }
        selectedId = button.dataset.id;
        const position = root.querySelector('#inventory-position');
        const device = state.devices[index % state.devices.length];
        if (position) {
            const announcement = device.name + ', ' + state.devices.length + '대 중 ' +
                ((index % state.devices.length) + 1) + '번째';
            if (position.textContent !== announcement) position.textContent = announcement;
        }
        return button;
    }

    function centerSelection() {
        const index = Math.max(0, state.devices.findIndex(device => device.id === selectedId));
        const chosen = canonicalIndex(index);
        moveTo(chosen);
        selectCard(chosen, true);
    }

    function settle() {
        if (!deck?.clientWidth || root.hidden || drag || state.devices.length < 2) return;
        if (navigationIndex !== null && Math.abs(deck.scrollLeft - cardLeft(navigationIndex)) > 3) return;
        navigationIndex = null;
        const index = nearestCard();
        const chosen = canonicalIndex(index);
        if (chosen !== index) moveTo(chosen);
        selectCard(chosen, true);
    }

    function onScroll() {
        if (!scrollFrame) scrollFrame = global.requestAnimationFrame(() => {
            scrollFrame = 0;
            syncCards();
        });
        global.clearTimeout(settleTimer);
        settleTimer = global.setTimeout(settle, 145);
    }

    function step(direction) {
        if (!deck || cards.length < 2) return;
        let index = navigationIndex ?? nearestCard();
        if (!cards[index + direction]) {
            index = canonicalIndex(index);
            moveTo(index);
        }
        navigationIndex = index + direction;
        moveTo(navigationIndex, true);
        if (reduceMotion.matches) settle();
    }

    function startDrag(event) {
        suppressPointerClick = false;
        if (event.pointerType !== 'mouse' || event.button !== 0 || state.devices.length < 2) return;
        navigationIndex = null;
        drag = { id: event.pointerId, x: event.clientX, start: deck.scrollLeft, moved: false };
    }

    function dragDeck(event) {
        if (drag?.id !== event.pointerId) return;
        const delta = event.clientX - drag.x;
        if (!drag.moved && Math.abs(delta) > 6) {
            drag.moved = true;
            suppressPointerClick = true;
            deck.setPointerCapture(event.pointerId);
            deck.classList.add('is-dragging');
        }
        if (drag.moved) deck.scrollLeft = drag.start - delta;
    }

    function endDrag(event) {
        if (drag?.id !== event.pointerId) return;
        const moved = drag.moved;
        drag = null;
        if (!moved) return;
        deck.classList.remove('is-dragging');
        moveTo(nearestCard(), true);
        if (reduceMotion.matches) settle();
    }

    function activateCard(event) {
        const button = event.target.closest('.inventory-card-button');
        if (!button) return;
        if (suppressPointerClick && event.detail > 0) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const index = cards.indexOf(button.closest('.inventory-card'));
        if (index < 0) return;
        navigationIndex = null;
        const chosen = canonicalIndex(index);
        moveTo(chosen);
        const selected = selectCard(chosen);
        selected.focus({ preventScroll: true });
        if (selected === button) return;
        event.preventDefault();
        event.stopPropagation();
        selected.click();
    }

    function attachDeck() {
        deck = root.querySelector('.inventory-deck-scroll');
        cards = [...deck.querySelectorAll('.inventory-card')];
        centerSelection();
        deck.addEventListener('click', activateCard);
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
        deck.addEventListener('pointerleave', event => {
            if (!drag?.moved) endDrag(event);
        });
        deck.addEventListener('touchstart', event => {
            navigationIndex = null;
            suppressPointerClick = false;
            touchX = event.touches[0]?.clientX ?? null;
        }, { passive: true });
        deck.addEventListener('touchmove', event => {
            const finger = event.touches[0];
            if (finger && touchX !== null && Math.abs(finger.clientX - touchX) > 8) suppressPointerClick = true;
        }, { passive: true });
        deck.addEventListener('touchend', () => { touchX = null; }, { passive: true });
        deck.addEventListener('touchcancel', () => { touchX = null; }, { passive: true });
        deck.addEventListener('wheel', event => { if (event.deltaX) navigationIndex = null; }, { passive: true });
        deck.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                step(event.key === 'ArrowLeft' ? -1 : 1);
            } else if (event.key === 'Enter' && event.target === deck) {
                event.preventDefault();
                cards[nearestCard()]?.querySelector('.inventory-card-button').click();
            }
        });
        if (typeof ResizeObserver === 'function') {
            let width = deck.clientWidth;
            sizeObserver = new ResizeObserver(() => {
                if (!deck?.clientWidth || deck.clientWidth === width) return;
                width = deck.clientWidth;
                navigationIndex = null;
                global.clearTimeout(settleTimer);
                centerSelection();
            });
            sizeObserver.observe(deck);
        }
    }

    function render(element, nextState) {
        if (root === element && state === nextState) return;
        root = element;
        state = nextState;
        draw();
    }

    function refresh(nextState) {
        if (root) render(root, nextState);
    }

    function focusDevice(id) {
        if (state && !state.devices.some(device => device.id === id)) return;
        selectedId = id;
        if (deck?.clientWidth) centerSelection();
    }

    global.DemoInventory = { render, refresh, focusDevice, detailStory, mountStory, latestReport };
})(globalThis);
