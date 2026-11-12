const app = {
    state: {
        pointId: 'dn2100',
        condition: '',
        mode: 'check',
        result: null,
        audioContext: null
    },

    router: {
        current: null,

        navigate(viewId) {
            const target = document.getElementById('view-' + viewId);
            if (!target) return;

            if (this.current) app.views[this.current]?.onExit?.();
            for (const view of document.querySelectorAll('.view')) {
                view.inert = view !== target;
                view.classList.toggle('active', view === target);
            }
            this.current = viewId;

            document.querySelectorAll('.bottom-nav button').forEach(button => {
                button.classList.toggle('active', button.dataset.target === viewId);
            });
            app.views[viewId]?.onEnter?.();
        }
    },

    equipment: {
        dn2100: 'DN Solutions Lynx 2100',
        kf5600: '현대위아 KF5600 II',
        ys080: '현대로보틱스 YS080',
        as50: '경원기계 AS-50'
    },

    storage: {
        read(key, fallback) {
            try {
                return JSON.parse(localStorage.getItem('10seconds:v1:' + key)) ?? fallback;
            } catch {
                return fallback;
            }
        },

        write(key, value) {
            try {
                localStorage.setItem('10seconds:v1:' + key, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        },

        baseline(id) {
            return this.read('baseline:' + id, null);
        },

        history(id) {
            return this.read('history:' + id, []);
        },

        saveRecord(id, record) {
            const history = this.history(id).filter(previous => previous.id !== record.id);
            return this.write('history:' + id, [record, ...history]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30));
        }
    },

    points: {
        list() {
            const defaults = Object.keys(app.equipment).map(id => ({
                id, equipmentId: id, label: '기본 측정 위치'
            }));
            return defaults.concat(app.storage.read('points', []));
        },

        find(id) {
            return this.list().find(point => point.id === id);
        },

        save(point) {
            const custom = app.storage.read('points', []);
            if (!app.storage.write('points', [...custom, point])) {
                throw new Error('측정 위치를 저장할 수 없습니다. 브라우저 저장 공간을 확인하세요.');
            }
            return point;
        },

        add(equipmentId, label) {
            if (!Object.hasOwn(app.equipment, equipmentId) || !label || label.length > 60) {
                throw new Error('설비와 측정 위치를 확인하세요.');
            }
            const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
            return this.save({ id: equipmentId + '-' + suffix, equipmentId, label });
        },

        fromTag(id, href) {
            const existing = this.find(id);
            if (existing) return existing;
            const equipmentId = /^([a-z0-9]+)-[a-f0-9]{12}$/.exec(id)?.[1];
            if (!href || !equipmentId || !Object.hasOwn(app.equipment, equipmentId)) return null;

            const url = new URL(href);
            const label = url.searchParams.get('location')?.trim();
            if (url.origin !== location.origin || !label || label.length > 60) return null;
            return this.save({ id, equipmentId, label });
        },

        tagLink(point) {
            const url = new URL(location.pathname === '/live.html' ? '/live.html' : '/', location.href);
            url.searchParams.set('point', point.id);
            if (point.id !== point.equipmentId) url.searchParams.set('location', point.label);
            return url.href;
        },

        equipmentHistory(equipmentId, pointId) {
            return this.list()
                .filter(point => point.equipmentId === equipmentId && (!pointId || point.id === pointId))
                .flatMap(point => app.storage.history(point.id).map(record => ({ ...record, point })))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
    },

    views: {
        home: {
            tagReady: false,
            nfcJob: null,
            nfcTask: null,

            onEnter() {
                this.refresh();
                this.status('버튼을 누른 뒤 설비의 NFC 스티커에 태그하세요.');
            },

            refresh(replace = false) {
                const point = app.points.find(app.state.pointId);
                const baseline = app.storage.baseline(point.id);
                const equipment = document.getElementById('scan-equipment');
                equipment.replaceChildren(...app.points.list().map(item =>
                    new Option(app.equipment[item.equipmentId] + ' · ' + item.label, item.id)));
                equipment.value = point.id;
                document.getElementById('baseline-info').textContent = baseline
                    ? '등록된 운전 조건 · ' + baseline.condition
                    : '이 위치에서 정상 가동음을 먼저 등록하세요.';
                document.getElementById('baseline-form').hidden = Boolean(baseline && !replace);
                document.getElementById('start-check').hidden = !baseline || replace;
                document.getElementById('replace-baseline').hidden = !baseline || replace;
                const condition = document.getElementById('baseline-condition');
                condition.value = baseline?.condition ?? '';
                condition.setCustomValidity('');
                document.getElementById('tag-link').value = app.points.tagLink(point);
                document.getElementById('write-tag').hidden = !EquipmentNFC.isSupported();
                document.getElementById('tag-ready').hidden = !this.tagReady || !baseline;
                document.getElementById('tag-ready-info').textContent = app.equipment[point.equipmentId] + ' · ' + point.label;
            },

            selectPoint(id) {
                this.nfcJob?.abort();
                this.tagReady = false;
                app.state.pointId = id;
                this.refresh();
            },

            start(mode, audioContext = null) {
                const baseline = app.storage.baseline(app.state.pointId);
                const condition = document.getElementById('baseline-condition');
                if (mode === 'baseline' && !condition.value.trim()) {
                    condition.setCustomValidity('정상 운전 조건을 입력하세요.');
                    condition.reportValidity();
                    return false;
                }
                if (mode === 'check' && !baseline) {
                    this.refresh();
                    return false;
                }
                this.tagReady = false;
                app.state.mode = mode;
                app.state.condition = mode === 'baseline' ? condition.value.trim() : baseline.condition;
                app.state.audioContext = audioContext;
                document.getElementById('manual-scan').open = false;
                app.router.navigate('measurement');
                return true;
            },

            handleTag(pointId, url, direct = false, audioContext = null) {
                const point = app.points.fromTag(pointId, url);
                if (!point) throw new Error('등록된 측정 위치를 찾을 수 없습니다. 이 앱에서 만든 NFC 링크를 확인하세요.');

                app.state.pointId = point.id;
                const hasBaseline = Boolean(app.storage.baseline(point.id));
                this.tagReady = hasBaseline && !direct;
                this.refresh();
                const name = app.equipment[point.equipmentId] + ' · ' + point.label;
                if (!hasBaseline) {
                    document.getElementById('manual-scan').open = true;
                    this.status(name + ' 인식 완료. 이 위치의 정상 가동음을 등록하세요.');
                    return false;
                }
                this.status(direct ? name + ' 인식 완료' : 'NFC 측정 위치를 확인했습니다.');
                return direct && this.start('check', audioContext);
            },

            status(message) {
                document.getElementById('nfc-status').textContent = message;
            },

            updateTagButtons() {
                const reading = this.nfcTask === 'read';
                const button = document.getElementById('start-tag-scan');
                button.classList.toggle('scanning', reading);
                button.setAttribute('aria-label', reading ? 'NFC 태그 읽기 취소' : 'NFC 태그로 측정');
                document.getElementById('tag-scan-title').textContent = reading ? 'NFC 태그 대기 중' : 'NFC 태그로 측정';
                document.getElementById('write-tag').textContent = this.nfcTask === 'write'
                    ? '쓰기 취소' : 'NFC 스티커에 쓰기';
            },

            async scanTag() {
                if (this.nfcJob) {
                    this.nfcJob.abort();
                    return;
                }
                if (!EquipmentNFC.isSupported()) {
                    document.getElementById('manual-scan').open = true;
                    this.status('휴대폰으로 NFC 스티커의 링크를 열거나, 아래에서 측정 위치를 선택하세요.');
                    return;
                }

                const job = new AbortController();
                this.nfcJob = job;
                this.nfcTask = 'read';
                this.updateTagButtons();
                this.status('NFC 권한을 확인하고 있습니다.');
                let audioContext = AudioAnalysis.prepareCapture();
                try {
                    const { pointId, url } = await EquipmentNFC.scan({
                        signal: job.signal,
                        origin: location.origin,
                        onWaiting: () => this.status('설비의 NFC 스티커에 태그하세요. 다시 누르면 취소됩니다.')
                    });
                    if (!job.signal.aborted && this.handleTag(pointId, url, true, audioContext)) {
                        audioContext = null;
                    }
                } catch (error) {
                    if (app.router.current === 'home') {
                        this.status(job.signal.aborted ? 'NFC 읽기를 취소했습니다.' : error.message);
                    }
                } finally {
                    if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {});
                    this.nfcJob = null;
                    this.nfcTask = null;
                    this.updateTagButtons();
                }
            },

            async writeTag() {
                if (this.nfcJob) {
                    this.nfcJob.abort();
                    return;
                }
                const job = new AbortController();
                this.nfcJob = job;
                this.nfcTask = 'write';
                this.updateTagButtons();
                const status = document.getElementById('tag-link-status');
                status.textContent = '선택한 측정 위치의 NFC 스티커를 휴대폰에 대세요.';
                try {
                    await EquipmentNFC.write({ url: document.getElementById('tag-link').value, signal: job.signal });
                    status.textContent = '측정 위치 링크를 NFC 스티커에 기록했습니다.';
                } catch (error) {
                    status.textContent = job.signal.aborted ? 'NFC 쓰기를 취소했습니다.' : error.message;
                } finally {
                    this.nfcJob = null;
                    this.nfcTask = null;
                    this.updateTagButtons();
                }
            },

            onExit() {
                this.nfcJob?.abort();
            }
        },

        measurement: {
            job: null,

            onEnter() {
                this.start();
            },

            async start() {
                this.job?.abort();
                const job = new AbortController();
                this.job = job;
                const { pointId, condition, mode, audioContext } = app.state;
                app.state.audioContext = null;
                const point = app.points.find(pointId);
                const baseline = app.storage.baseline(pointId);
                const progressText = document.getElementById('progress-text');
                const retry = document.getElementById('retry-recording');
                const circle = document.querySelector('.progress-ring__circle');
                const circumference = 2 * Math.PI * Number(circle.getAttribute('r'));

                retry.hidden = true;
                circle.style.strokeDasharray = circumference;
                circle.style.strokeDashoffset = circumference;
                progressText.textContent = '마이크 권한을 확인하고 있습니다';

                try {
                    const { samples, sampleRate } = await AudioAnalysis.capture({
                        durationMs: 10000,
                        signal: job.signal,
                        preparedContext: audioContext,
                        onProgress: fraction => {
                            if (job.signal.aborted) return;
                            circle.style.strokeDashoffset = circumference * (1 - fraction);
                            progressText.textContent = '가동음 녹음 중 · ' +
                                Math.min(10, Math.floor(fraction * 10)) + ' / 10초';
                        }
                    });
                    if (job.signal.aborted) return;
                    progressText.textContent = '가동음 주파수를 계산하고 있습니다';
                    const features = AudioAnalysis.analyze(samples, sampleRate);
                    const createdAt = new Date().toISOString();

                    if (mode === 'baseline') {
                        if (!app.storage.write('baseline:' + pointId, { condition, createdAt, features })) {
                            throw new Error('정상 기준을 저장할 수 없습니다. 브라우저 저장 공간을 확인하세요.');
                        }
                        app.state.result = { point, condition, mode };
                    } else {
                        if (!baseline) throw new Error('이 위치의 정상 가동음을 먼저 등록하세요.');
                        const comparison = AudioAnalysis.compare(baseline.features, features);
                        const record = {
                            id: crypto.randomUUID(),
                            condition,
                            createdAt,
                            comparison,
                            explanation: null
                        };
                        const stored = app.storage.saveRecord(pointId, record);
                        app.state.result = { point, condition, mode, record, stored, baseline, features };
                    }
                    app.router.navigate('result');
                } catch (error) {
                    if (job.signal.aborted) return;
                    const microphoneErrors = {
                        NotAllowedError: '브라우저에서 마이크 권한을 허용한 뒤 다시 측정하세요.',
                        SecurityError: '브라우저에서 마이크 권한을 허용한 뒤 다시 측정하세요.',
                        NotFoundError: '사용할 수 있는 마이크가 없습니다. 마이크 연결을 확인하세요.',
                        NotReadableError: '마이크를 열 수 없습니다. 다른 앱에서 사용 중인지 확인하세요.'
                    };
                    progressText.textContent = microphoneErrors[error.name] || error.message ||
                        '측정을 완료하지 못했습니다. 다시 시도하세요.';
                    retry.hidden = false;
                }
            },

            onExit() {
                this.job?.abort();
                this.job = null;
            }
        },

        result: {
            job: null,

            onEnter() {
                const result = app.state.result;
                if (!result) {
                    app.router.navigate('home');
                    return;
                }
                this.render(result);
                if (result.record && !result.record.explanation) this.requestExplanation();
            },

            onExit() {
                this.job?.abort();
                this.job = null;
            },

            render(result) {
                const { point, condition, record, stored } = result;
                const comparison = record?.comparison;
                const different = comparison?.status === 'different';
                const title = comparison ? app.comparisonLabel(comparison) : '정상 기준 등록 완료';
                const container = document.getElementById('result-content');
                container.innerHTML = `
                    <div class="result-container ${different ? 'danger' : 'safe'}">
                        <div class="result-content-wrapper">
                            <div class="status-icon-large" aria-hidden="true">
                                <i class="fa-solid ${different ? 'fa-wave-square' : 'fa-microphone'}"></i>
                            </div>
                            <div class="status-text-group">
                                <p class="status-label" id="result-equipment"></p>
                                <h2 class="status-headline">${title}</h2>
                                <p class="status-desc" id="result-condition"></p>
                            </div>
                            <div id="fft-result"></div>
                            <section class="glass-card ai-explanation" id="ai-explanation" ${record ? '' : 'hidden'}>
                                <h3>AI 분석 설명</h3>
                                <p id="explanation-status" role="status"></p>
                                <div id="explanation-details"></div>
                                <button id="retry-explanation" class="btn-glass-secondary" type="button" hidden>AI 설명 다시 요청</button>
                            </section>
                            ${record && !stored ? '<p class="storage-warning">브라우저에 점검 이력을 저장하지 못했습니다.</p>' : ''}
                            <div class="action-group">
                                <button class="btn-glass-primary" type="button" onclick="app.router.navigate('home')">
                                    ${record ? '홈으로' : '점검 화면으로'}
                                </button>
                                ${record ? '<button id="result-history" class="btn-glass-secondary" type="button">설비 점검 이력</button>' : ''}
                            </div>
                        </div>
                    </div>`;
                document.getElementById('result-equipment').textContent = app.equipment[point.equipmentId];
                document.getElementById('result-condition').textContent = point.label + ' · ' + condition;
                if (!record) return;

                app.renderComparison(document.getElementById('fft-result'), comparison);
                document.getElementById('retry-explanation').onclick = () => this.requestExplanation();
                document.getElementById('result-history').onclick = () => app.views.report.show(point.equipmentId, point.id);
                if (record.explanation) {
                    app.renderExplanation(document.getElementById('explanation-details'), record.explanation);
                }
            },

            async requestExplanation() {
                this.job?.abort();
                const job = new AbortController();
                this.job = job;
                const { point, condition, record, baseline, features, stored } = app.state.result;
                const status = document.getElementById('explanation-status');
                const retry = document.getElementById('retry-explanation');
                status.textContent = '주파수 차이에 대한 AI 설명을 요청하고 있습니다.';
                retry.hidden = true;

                const describe = ({ version, durationSeconds, sampleRate, rmsDb, peakHz }) =>
                    ({ version, durationSeconds, sampleRate, rmsDb, peakHz });

                try {
                    const response = await fetch('/api/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: job.signal,
                        body: JSON.stringify({
                            equipment: app.equipment[point.equipmentId] + ' · ' + point.label,
                            condition,
                            baseline: describe(baseline.features),
                            measurement: describe(features),
                            comparison: record.comparison
                        })
                    });
                    const explanation = await response.json().catch(() => null);
                    if (!response.ok) {
                        throw new Error(explanation?.error || 'AI 분석 서버에 연결할 수 없습니다.');
                    }
                    if (typeof explanation?.summary !== 'string' ||
                        !Array.isArray(explanation.observations) || !Array.isArray(explanation.nextChecks)) {
                        throw new Error('AI 분석 응답을 읽을 수 없습니다.');
                    }
                    if (job.signal.aborted) return;
                    record.explanation = explanation;
                    if (stored && !app.storage.saveRecord(point.id, record)) {
                        status.textContent = 'AI 설명은 표시되었으나 이력에는 저장되지 않았습니다.';
                    } else {
                        status.textContent = '';
                    }
                    app.renderExplanation(document.getElementById('explanation-details'), explanation);
                } catch (error) {
                    if (job.signal.aborted) return;
                    status.textContent = error instanceof TypeError
                        ? 'AI 분석 서버에 연결할 수 없습니다. 서버 실행 상태를 확인하세요.'
                        : error.message;
                    retry.hidden = false;
                }
            }
        },

        management: {
            onEnter() {
                this.initDragScroll();
                this.initBottomSheet();
                document.getElementById('equipment-sheet').classList.remove('expanded');
                this.updateSummarySheet();
            },

            updateSummarySheet() {
                const cards = [...document.querySelectorAll('.equip-card')];
                const counts = { similar: 0, different: 0, pending: 0 };
                const list = document.getElementById('sheet-equipment-list');
                list.replaceChildren();

                cards.forEach(card => {
                    const id = card.dataset.equipment;
                    const latest = app.points.equipmentHistory(id)[0];
                    const status = latest?.comparison.status || 'pending';
                    counts[status]++;
                    const label = latest ? app.comparisonLabel(latest.comparison) : '미측정';
                    const badge = card.querySelector('.status-badge');
                    badge.textContent = label;
                    badge.className = 'status-badge ' +
                        (status === 'similar' ? 'safe' : status === 'different' ? 'warning' : '');

                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'clean-list-item measured-equipment-item';
                    item.textContent = app.equipment[id] + ' · ' + label;
                    item.onclick = () => app.views.report.show(id);
                    list.append(item);
                });

                document.getElementById('sheet-count-safe').textContent = counts.similar;
                document.getElementById('sheet-count-warning').textContent = counts.different;
                document.getElementById('sheet-count-danger').textContent = counts.pending;
                this.coveragePercent = cards.length
                    ? 100 * (cards.length - counts.pending) / cards.length
                    : 0;
                this.animateChart(0);
            },

            initBottomSheet() {
                const sheet = document.getElementById('equipment-sheet');
                if (!sheet) return;

                // Force re-initialization with v2 flag
                if (sheet.hasAttribute('data-initialized-v2')) return;
                sheet.setAttribute('data-initialized-v2', 'true');

                const content = sheet.querySelector('.sheet-content');
                const handle = sheet.querySelector('.sheet-handle-wrapper');
                

                let startY;
                let isDragging = false;

                const isExpanded = () => sheet.classList.contains('expanded');

                // Touch Start - Anywhere on sheet
                sheet.addEventListener('touchstart', (e) => {
                    const expanded = isExpanded();
                    const isContent = content.contains(e.target);
                    const scrollTop = content ? content.scrollTop : 0;

                    if (!expanded) {
                        // Collapsed: Swipe UP anywhere opens it
                        isDragging = true;
                    } else {
                        // Expanded
                        if (!isContent) {
                            // Header/Handle: Always drag
                            isDragging = true;
                        } else {
                            // Content: Only drag if at top
                            if (scrollTop <= 0) {
                                isDragging = true;
                            } else {
                                isDragging = false; // Allow internal scroll
                            }
                        }
                    }

                    if (isDragging) {
                        startY = e.touches[0].clientY;
                    }
                }, { passive: false });

                // Touch Move
                sheet.addEventListener('touchmove', (e) => {
                    if (!isDragging) return;

                    const currentY = e.touches[0].clientY;
                    const deltaY = currentY - startY;
                    const expanded = isExpanded();
                    const isContent = content.contains(e.target);

                    if (expanded && isContent) {
                        // If moving UP (deltaY < 0), logic says scroll content down.
                        // So we un-flag dragging to let native scroll take over? 
                        // Actually, better to just return and let event bubble if it's a scroll.
                        if (deltaY < 0) return;

                        // If moving DOWN (deltaY > 0) and at top, we want to close.
                        if (e.cancelable) e.preventDefault();
                    } else {
                        // Collapsed or Header -> Prevent page bounce
                        if (e.cancelable) e.preventDefault();
                    }
                }, { passive: false });

                // Touch End
                sheet.addEventListener('touchend', (e) => {
                    if (!isDragging) return;
                    isDragging = false;

                    const currentY = e.changedTouches[0].clientY;
                    const deltaY = currentY - startY;
                    const expanded = isExpanded();

                    if (Math.abs(deltaY) > 50) {
                        if (deltaY < 0 && !expanded) {
                            sheet.classList.add('expanded');
                            // Trigger Animation
                            this.animateChart(this.coveragePercent);
                        } else if (deltaY > 0 && expanded) {
                            sheet.classList.remove('expanded');
                            // Reset Animation
                            this.animateChart(0);
                        }
                    }
                });

                // Mouse (Simple)
                sheet.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startY = e.clientY;
                });
                window.addEventListener('mouseup', (e) => {
                    if (!isDragging) return;
                    isDragging = false;
                    const deltaY = e.clientY - startY;
                    const expanded = isExpanded();
                    if (Math.abs(deltaY) > 50) {
                        if (deltaY < 0 && !expanded) {
                            sheet.classList.add('expanded');
                            this.animateChart(this.coveragePercent);
                        }
                        else if (deltaY > 0 && expanded) {
                            sheet.classList.remove('expanded');
                            this.animateChart(0);
                        }
                    }
                });
            },

            initDragScroll() {
                const slider = document.querySelector('.equipment-grid');
                if (!slider || slider.dataset.dragReady) return;
                slider.dataset.dragReady = 'true';

                let isDown = false;
                let startX;
                let scrollLeft;

                slider.addEventListener('mousedown', (e) => {
                    isDown = true;
                    slider.style.cursor = 'grabbing';
                    slider.style.scrollSnapType = 'none'; // Disable snap while dragging
                    startX = e.pageX - slider.offsetLeft;
                    scrollLeft = slider.scrollLeft;
                });

                const stopDragging = () => {
                    if (!isDown) return;
                    isDown = false;
                    slider.style.cursor = 'grab';
                    slider.style.scrollSnapType = 'x mandatory'; // Re-enable snap
                };

                slider.addEventListener('mouseleave', stopDragging);
                slider.addEventListener('mouseup', stopDragging);

                slider.addEventListener('mousemove', (e) => {
                    if (!isDown) return;
                    e.preventDefault();
                    const x = e.pageX - slider.offsetLeft;
                    const walk = (x - startX); // 1:1 movement (natural feel)
                    slider.scrollLeft = scrollLeft - walk;
                });
            },

            // Animation helper
            animateChart(targetPercent) {
                const chart = document.getElementById('efficiency-chart');
                if (!chart) return;

                // Simple lerp animation
                const startPercent = parseFloat(chart.dataset.currentPercent || 0);
                const startTime = performance.now();
                const duration = 1500; // Slower, smoother

                const animate = (time) => {
                    const elapsed = time - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    // Ease out Quartic (Smoother)
                    const ease = 1 - Math.pow(1 - progress, 4);

                    const current = startPercent + (targetPercent - startPercent) * ease;

                    chart.dataset.currentPercent = current;

                    // Animate Text
                    const textEl = document.getElementById('total-efficiency');
                    if (textEl) {
                        textEl.innerText = Math.round(current) + '%';
                    }

                    // Emotional Gradient: Sky Blue -> Vibrant Cyan
                    const themeStart = '#4facfe';
                    const themeEnd = '#00f2fe';
                    const emptyColor = '#eee'; // Softer empty color

                    chart.style.background = `conic-gradient(
                        ${themeStart} 0%, 
                        ${themeEnd} ${current}%, 
                        ${emptyColor} ${current}% 100%
                    )`;

                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    }
                };

                requestAnimationFrame(animate);
            }
        },


        report: {
            show(id, pointId) {
                if (!app.equipment[id]) return;
                const container = document.getElementById('report-content');
                container.replaceChildren();

                const title = document.createElement('h3');
                title.textContent = app.equipment[id];
                container.append(title);

                const history = app.points.equipmentHistory(id, pointId);
                if (!history.length) {
                    const empty = document.createElement('p');
                    empty.textContent = '저장된 가동음 점검 결과가 없습니다.';
                    container.append(empty);
                }

                history.forEach(record => {
                    const entry = document.createElement('details');
                    entry.className = 'scan-history-entry';
                    const heading = document.createElement('summary');
                    heading.textContent = new Date(record.createdAt).toLocaleString('ko-KR') +
                        ' · ' + app.comparisonLabel(record.comparison);
                    const condition = document.createElement('p');
                    condition.textContent = record.point.label + ' · ' + record.condition;
                    entry.append(heading, condition);
                    app.renderComparison(entry, record.comparison);
                    if (record.explanation) {
                        const explanation = document.createElement('div');
                        app.renderExplanation(explanation, record.explanation);
                        entry.append(explanation);
                    }
                    container.append(entry);
                });

                app.router.navigate('report');
            }
        }
    },

    comparisonLabel({ status }) {
        return status === 'different' ? '가동음 변화 감지' : '정상 기준과 유사';
    },

    renderComparison(container, comparison) {
        const card = document.createElement('section');
        card.className = 'glass-card fft-summary';
        const heading = document.createElement('h3');
        heading.textContent = 'FFT 비교 결과';
        const peak = document.createElement('p');
        peak.textContent = '대표 주파수 · ' + Math.round(comparison.baselinePeakHz) + ' → ' +
            Math.round(comparison.currentPeakHz) + ' Hz';
        const level = document.createElement('p');
        level.textContent = '기준 대비 전체 녹음 레벨 · ' + this.signedDb(comparison.rmsChangeDb);
        card.append(heading, peak, level);

        const bands = document.createElement('ul');
        comparison.bandChanges.slice(0, 3).forEach(band => {
            const row = document.createElement('li');
            row.textContent = Math.round(band.frequencyHz) + ' Hz 중심 대역 · ' + this.signedDb(band.changeDb);
            bands.append(row);
        });
        if (bands.childElementCount) card.append(bands);
        container.append(card);
    },

    signedDb(value) {
        return (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
    },

    renderExplanation(container, explanation) {
        const summary = document.createElement('p');
        summary.textContent = explanation.summary;
        container.replaceChildren(summary);

        for (const [headingText, items] of [
            ['관측된 변화', explanation.observations],
            ['확인할 항목', explanation.nextChecks]
        ]) {
            if (!items.length) continue;
            const heading = document.createElement('h4');
            heading.textContent = headingText;
            const list = document.createElement('ul');
            for (const item of items) {
                const row = document.createElement('li');
                row.textContent = item;
                list.append(row);
            }
            container.append(heading, list);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const home = app.views.home;
    const equipment = document.getElementById('scan-equipment');
    const pointEquipment = document.getElementById('point-equipment');
    for (const [id, name] of Object.entries(app.equipment)) {
        pointEquipment.add(new Option(name, id));
    }
    equipment.addEventListener('change', () => home.selectPoint(equipment.value));
    document.getElementById('add-point-form').addEventListener('submit', event => {
        event.preventDefault();
        const input = document.getElementById('point-label');
        const status = document.getElementById('point-status');
        try {
            const point = app.points.add(pointEquipment.value, input.value.trim());
            home.selectPoint(point.id);
            input.value = '';
            status.textContent = point.label + ' 측정 위치를 등록했습니다.';
        } catch (error) {
            status.textContent = error.message;
        }
    });
    document.getElementById('copy-tag-link').addEventListener('click', async () => {
        const link = document.getElementById('tag-link');
        const status = document.getElementById('tag-link-status');
        try {
            await navigator.clipboard.writeText(link.value);
            status.textContent = '측정 위치 링크를 복사했습니다.';
        } catch {
            link.select();
            status.textContent = '선택한 링크를 복사해 NFC 스티커에 기록하세요.';
        }
    });
    document.getElementById('start-tag-scan').onclick = () => home.scanTag();
    document.getElementById('write-tag').onclick = () => home.writeTag();
    document.getElementById('start-tag-measurement').onclick = () => home.start('check');
    const condition = document.getElementById('baseline-condition');
    condition.addEventListener('input', () => condition.setCustomValidity(''));
    document.getElementById('baseline-form').addEventListener('submit', event => {
        event.preventDefault();
        home.start('baseline');
    });
    document.getElementById('start-check').onclick = () => home.start('check');
    document.getElementById('replace-baseline').onclick = () => {
        home.refresh(true);
        condition.focus();
    };
    document.getElementById('retry-recording').onclick = () => app.views.measurement.start();
    document.getElementById('cancel-recording').onclick = () => app.router.navigate('home');

    app.router.navigate('home');
    const taggedPoint = EquipmentNFC.readPointFromUrl(location.href);
    if (taggedPoint) {
        try {
            home.handleTag(taggedPoint, location.href);
        } catch (error) {
            home.status(error.message);
        }
    }
});
