const app = {
    // Application State
    state: {
        isScanning: false,
        scanProgress: 0,
        currentResult: null, // 'safe' or 'danger'
    },

    // Router Logic
    router: {
        routes: ['splash', 'onboarding', 'home', 'measurement', 'result', 'management'],

        init() {
            // Default to home directly
            this.navigate('home');
        },

        navigate(viewId) {
            // Hide all views & trigger exit
            document.querySelectorAll('.view').forEach(el => {
                if (el.classList.contains('active')) {
                    const currentViewId = el.id.replace('view-', '');
                    if (app.views[currentViewId] && app.views[currentViewId].onExit) {
                        app.views[currentViewId].onExit();
                    }
                    el.classList.remove('active');
                }
            });

            // Show target view
            const target = document.getElementById(`view-${viewId}`);
            if (target) {
                target.classList.add('active');

                // Trigger specific view logic
                if (app.views[viewId] && app.views[viewId].onEnter) {
                    app.views[viewId].onEnter();
                }
            }

            // Update Bottom Navigation
            document.querySelectorAll('.bottom-nav button').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.target === viewId) {
                    btn.classList.add('active');
                }
            });
        }
    },

    // View Controllers
    views: {
        home: {
            startScan() {
                // Direct navigation with slight delay for UX
                app.router.navigate('measurement');
            }
        },

        measurement: {
            timerInterval: null,
            animationFrame: null,
            waveCanvas: null, // Kept for logic if needed, but UI removed
            waveCtx: null,
            startTime: 0,

            onEnter() {
                app.state.isScanning = true;
                app.state.scanProgress = 0;

                // Ensure waves are visible (in case they were hidden globally before)
                document.querySelectorAll('#view-measurement .wave').forEach(el => el.style.display = 'block');

                // Initialize Progress Ring
                const circle = document.querySelector('.progress-ring__circle');
                const radius = circle.r.baseVal.value;
                const circumference = radius * 2 * Math.PI;

                circle.style.strokeDasharray = `${circumference} ${circumference}`;
                circle.style.strokeDashoffset = circumference; // Start empty

                this.startSimulation(circle, circumference);
            },

            // setupCanvas removed as we don't need it for visualization anymore (using CSS waves only)

            startSimulation(circle, circumference) {
                this.startTime = Date.now();
                const progressText = document.getElementById('progress-text');
                const duration = 3000; // 3 seconds (Super Fast Demo Mode)

                // Timer & Logic Loop
                this.timerInterval = setInterval(() => {
                    const elapsed = Date.now() - this.startTime;
                    const progress = Math.min((elapsed / duration), 1); // 0 to 1

                    // Update Ring
                    const offset = circumference - (progress * circumference);
                    circle.style.strokeDashoffset = offset;

                    // Update State
                    app.state.scanProgress = progress * 100;

                    if (progress * 100 < 30) progressText.innerText = "초기화 및 센서 보정 중...";
                    else if (progress * 100 < 70) progressText.innerText = "주파수 대역 정밀 스캔 중...";
                    else progressText.innerText = "데이터 분석 및 결함 탐지 중...";

                    if (elapsed >= duration) {
                        this.finishScan();
                    }
                }, 16);
            },

            // drawWaveform/drawFFT removed - relying on CSS animation

            finishScan() {
                clearInterval(this.timerInterval);
                // Result Logic (Random for Demo)
                const result = Math.random() > 0.5 ? 'safe' : 'danger';
                app.state.currentResult = result;
                app.router.navigate('result');
            },

            onExit() {
                if (this.timerInterval) clearInterval(this.timerInterval);
            }
        },

        result: {
            onEnter() {
                const container = document.getElementById('result-content');
                const isSafe = app.state.currentResult === 'safe';

                // Emotional Design Structure
                const html = `
                    <div class="result-container ${isSafe ? 'safe' : 'danger'}">
                        <div class="result-content-wrapper">
                            <div class="status-icon-large">
                                <i class="fa-solid ${isSafe ? 'fa-shield-heart' : 'fa-triangle-exclamation'}"></i>
                            </div>
                            
                            <div class="status-text-group">
                                <span class="status-label">AI Analysis Complete</span>
                                <h2 class="status-headline">${isSafe ? '정상입니다' : '점검이 필요합니다'}</h2>
                                <p class="status-desc">${isSafe ? '설비가 편안한 상태로<br>운용되고 있습니다.' : '평소와 다른 진동이<br>감지되었습니다.'}</p>
                            </div>

                            <div class="glass-card">
                                <div class="data-row">
                                    <span class="data-label">${isSafe ? '안전 신뢰도' : '위험 심각도'}</span>
                                    <span class="data-value">${isSafe ? '98.5%' : '심각 (High)'}</span>
                                </div>
                                <div class="divider"></div>
                                <div class="data-row">
                                    <span class="data-label">진단 소견</span>
                                    <span class="data-value">${isSafe ? '진동 패턴 안정적' : '베어링 마모 의심'}</span>
                                </div>
                            </div>

                            <div class="action-group">
                                <button class="btn-glass-primary" onclick="app.router.navigate('home')">
                                    ${isSafe ? '확인 완료' : '재진단 수행'}
                                </button>
                                <button class="btn-glass-secondary" onclick="app.views.report.show('dn2100')">
                                    상세 리포트 보기
                                </button>
                            </div>
                        </div>
                        
                        <!-- Ambient Particles (Optional enhancement) -->
                        <div class="ambient-circle c1"></div>
                        <div class="ambient-circle c2"></div>
                    </div>
                `;

                if (container) container.innerHTML = html;

                // Add to history
                app.ui.addHistory(isSafe);
            }
        },

        management: {
            onEnter() {
                this.initDragScroll();
                this.initBottomSheet();
                this.updateSummarySheet();

                // Reset bottom sheet state to collapsed when entering tab
                const sheet = document.getElementById('equipment-sheet');
                if (sheet) sheet.classList.remove('expanded');
            },

            updateSummarySheet() {
                const total = document.querySelectorAll('.equip-card').length;
                const safe = document.querySelectorAll('.status-badge.safe').length;
                const warning = document.querySelectorAll('.status-badge.warning').length;
                const danger = document.querySelectorAll('.status-badge.danger').length;

                // Update Header Counts
                const elTotal = document.getElementById('sheet-count-total');
                const elSafe = document.getElementById('sheet-count-safe');
                const elWarning = document.getElementById('sheet-count-warning');

                if (elTotal) elTotal.innerText = total;
                if (elSafe) elSafe.innerText = safe;
                if (elWarning) {
                    elWarning.innerText = warning + danger;
                    elWarning.style.color = (danger > 0) ? 'var(--status-danger)' : 'var(--status-warning)';
                }

                // Populate Equipment List (Clone from Cards)
                const listContainer = document.getElementById('sheet-equipment-list');
                if (!listContainer) return;

                listContainer.innerHTML = ''; // Clear existing

                const cards = document.querySelectorAll('.equip-card');
                cards.forEach(card => {
                    const img = card.querySelector('img').src;
                    const name = card.querySelector('h3').innerText;
                    const type = card.querySelector('p').innerText;
                    const statusText = card.querySelector('.status-badge').innerText;
                    let statusClass = 'safe';
                    if (card.querySelector('.status-badge.warning')) statusClass = 'warning';
                    if (card.querySelector('.status-badge.danger')) statusClass = 'danger';

                    const itemHtml = `
                        <div class="equipment-list-item" onclick="${card.getAttribute('onclick')}">
                            <img src="${img}" class="list-item-thumb">
                            <div class="list-item-info">
                                <div class="list-item-name">${name}</div>
                                <div class="list-item-type">${type}</div>
                            </div>
                            <div class="list-item-status ${statusClass}">${statusText}</div>
                        </div>
                    `;
                    listContainer.insertAdjacentHTML('beforeend', itemHtml);
                });
            },

            initBottomSheet() {
                const sheet = document.getElementById('equipment-sheet');

                // Prevent duplicate initialization
                if (!sheet || sheet.hasAttribute('data-initialized')) return;
                sheet.setAttribute('data-initialized', 'true');

                const handle = sheet.querySelector('.sheet-handle-wrapper');
                const header = sheet.querySelector('.sheet-header');

                if (!sheet || !handle || !header) return;

                let startY, currentY, initialTranslateY;
                let isDragging = false;
                let isExpanded = false;
                const collapsedTranslate = 'calc(100% - 250px)'; // Must match CSS

                const onTouchStart = (e) => {
                    // Only allow drag if touching handle or header
                    // But if expanded, allow drag on header/handle only (content scrolls)
                    const target = e.target;
                    if (!handle.contains(target) && !header.contains(target)) return;

                    isDragging = true;
                    startY = e.touches[0].clientY;
                    sheet.style.transition = 'none'; // Disable transition for direct follow

                    // Get current transform value (approx)
                    const style = window.getComputedStyle(sheet);
                    const matrix = new WebKitCSSMatrix(style.transform);
                    initialTranslateY = matrix.m42;
                };

                const onTouchMove = (e) => {
                    if (!isDragging) return;
                    e.preventDefault(); // Prevent page scroll
                    currentY = e.touches[0].clientY;
                    const deltaY = currentY - startY;

                    // Calculate new position (clamped)
                    // We need to map this to the sheet's logic. 
                    // Simplified: just move it by delta
                    // Note: This needs robust logic relative to state. 
                    // For simplicity in this iteration, we use a threshold logic on end.
                };

                const onTouchEnd = (e) => {
                    if (!isDragging) return;
                    isDragging = false;
                    sheet.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

                    const deltaY = currentY - startY;

                    // Threshold to toggle
                    if (Math.abs(deltaY) > 50) {
                        if (deltaY < 0 && !isExpanded) {
                            // Dragged Up -> Expand
                            sheet.classList.add('expanded');
                            isExpanded = true;
                        } else if (deltaY > 0 && isExpanded) {
                            // Dragged Down -> Collapse
                            sheet.classList.remove('expanded');
                            isExpanded = false;
                        }
                    } else {
                        // Revert if threshold not met (handled by CSS class state)
                        if (isExpanded) sheet.classList.add('expanded');
                        else sheet.classList.remove('expanded');
                    }
                };

                // Attach events to handle and header
                [handle, header].forEach(el => {
                    el.addEventListener('touchstart', onTouchStart, { passive: false });
                    el.addEventListener('touchmove', onTouchMove, { passive: false });
                    el.addEventListener('touchend', onTouchEnd);

                    // Mouse events for desktop testing
                    el.addEventListener('mousedown', (e) => {
                        isDragging = true;
                        startY = e.clientY;
                    });

                    window.addEventListener('mousemove', (e) => {
                        if (!isDragging) return;
                        currentY = e.clientY;
                    });

                    window.addEventListener('mouseup', (e) => {
                        if (!isDragging) return;
                        isDragging = false;
                        const deltaY = currentY - startY;
                        if (Math.abs(deltaY) > 50) {
                            if (deltaY < 0 && !isExpanded) {
                                sheet.classList.add('expanded');
                                isExpanded = true;
                            } else if (deltaY > 0 && isExpanded) {
                                sheet.classList.remove('expanded');
                                isExpanded = false;
                            }
                        }
                    });
                });
            },

            initDragScroll() {
                const slider = document.querySelector('.equipment-grid');
                if (!slider) return;

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
            }
        },

        report: {
            show(id) {
                const data = app.data.equipment[id];
                if (data) {
                    this.render(data);
                    app.router.navigate('report');
                } else {
                    alert('장비 데이터를 찾을 수 없습니다.');
                }
            },

            render(data) {
                const container = document.getElementById('report-content');

                // Color logic for status (Modern Minimalist)
                let statusColor = 'var(--success)';
                let statusText = '최고 (Excellent)';
                let statusBg = 'rgba(16, 185, 129, 0.1)';

                if (data.healthScore < 80) {
                    statusColor = 'var(--danger)';
                    statusText = '경고 (Warning)';
                    statusBg = 'rgba(239, 68, 68, 0.1)';
                }
                else if (data.healthScore < 90) {
                    statusColor = 'var(--warning)';
                    statusText = '주의 (Attention)';
                    statusBg = 'rgba(245, 158, 11, 0.1)';
                }

                // Components List (Clean & Professional)
                let componentHtml = '';
                data.components.forEach(comp => {
                    let color = 'var(--accent)';
                    if (comp.health < 40) color = 'var(--danger)';
                    else if (comp.health < 70) color = 'var(--warning)';

                    componentHtml += `
                        <div class="modern-row">
                            <div class="row-info">
                                <span class="row-name">${comp.name}</span>
                                <span class="row-sub">교체 권장: ${comp.replaceIn}</span>
                            </div>
                            <div class="row-stat">
                                <div class="stat-bar-bg">
                                    <div class="stat-bar-fill" style="width: ${comp.health}%; background: ${color}"></div>
                                </div>
                                <span class="stat-text" style="color: ${color}">${comp.health}%</span>
                            </div>
                        </div>
                    `;
                });

                // History Timeline (Vertical & Clean)
                let historyHtml = '';
                data.history.forEach((hist, index) => {
                    historyHtml += `
                        <div class="modern-timeline-item">
                            <div class="timeline-dot"></div>
                            <div class="timeline-data">
                                <span class="timeline-date">${hist.date}</span>
                                <span class="timeline-desc">${hist.type} · ${hist.result}</span>
                            </div>
                        </div>
                    `;
                });

                const html = `
                    <div class="modern-nav">
                        <button onclick="app.router.navigate('home')" class="nav-btn"><i class="fa-solid fa-arrow-left"></i></button>
                        <span class="nav-title">상세 리포트</span>
                        <div style="width: 40px;"></div> <!-- Spacer -->
                    </div>

                    <div class="modern-content">
                        <!-- Hero Section -->
                        <div class="modern-hero">
                            <div class="hero-image-container">
                                <img src="${data.image}" alt="${data.name}" class="modern-img">
                            </div>
                            <div class="hero-header">
                                <div class="header-top">
                                    <span class="equipment-type">${data.type}</span>
                                    <span class="status-badge" style="background: ${statusBg}; color: ${statusColor}">${statusText}</span>
                                </div>
                                <h1 class="equipment-name">${data.name}</h1>
                            </div>
                        </div>

                        <!-- Key Metrics Card -->
                        <div class="modern-card">
                            <h3 class="card-title">핵심 진단 지표</h3>
                            <div class="metrics-row">
                                <div class="metric-item">
                                    <span class="m-label">종합 점수</span>
                                    <span class="m-value" style="color: ${statusColor}">${data.healthScore}</span>
                                </div>
                                <div class="metric-divider"></div>
                                <div class="metric-item">
                                    <span class="m-label">잔여 수명</span>
                                    <span class="m-value">${data.lifespan}<span class="unit">년</span></span>
                                </div>
                                <div class="metric-divider"></div>
                                <div class="metric-item">
                                    <span class="m-label">효율</span>
                                    <span class="m-value">${data.efficiency}<span class="unit">%</span></span>
                                </div>
                            </div>
                        </div>

                        <!-- Components Card -->
                        <div class="modern-card">
                            <h3 class="card-title">부품별 상세 진단</h3>
                            <div class="rows-container">
                                ${componentHtml}
                            </div>
                        </div>

                        <!-- History Card -->
                        <div class="modern-card">
                            <h3 class="card-title">최근 점검 이력</h3>
                            <div class="timeline-container">
                                ${historyHtml}
                            </div>
                        </div>
                        
                        <button class="btn-modern-action" onclick="app.router.navigate('home')">
                            확인 완료
                        </button>
                    </div>
                `;

                if (container) container.innerHTML = html;
            }
        }
    },

    // Mock Data
    data: {
        equipment: {
            'dn2100': {
                name: 'DN Solutions Lynx 2100',
                type: 'CNC 터닝 센터',
                image: 'assets/equipment/DN Solutions Lynx 2100.png',
                healthScore: 98,
                lifespan: 12.5,
                efficiency: 95,
                nextCheck: '2026.04.15',
                vibration: 0.8,
                components: [
                    { name: '스핀들 유닛', health: 96, replaceIn: '4년' },
                    { name: '유압 척', health: 88, replaceIn: '2년' },
                    { name: '서보 모터', health: 99, replaceIn: '5년+' }
                ],
                history: [
                    { date: '2026.01.10', type: '정기 정밀 진단', result: '이상 없음 (진동 수치 양호)' },
                    { date: '2025.10.05', type: '소모품 교체', result: '냉각수 펌프 필터 교체 완료' }
                ]
            },
            'kf5600': {
                name: '현대위아 KF5600 II',
                type: '수직형 머시닝 센터',
                image: 'assets/equipment/현대위아 KF5600 II.png',
                healthScore: 82,
                lifespan: 8.2,
                efficiency: 89,
                nextCheck: '2026.02.20',
                vibration: 1.2,
                components: [
                    { name: 'ATC 매거진', health: 75, replaceIn: '1년' },
                    { name: 'LM 가이드', health: 90, replaceIn: '10년' }
                ],
                history: [
                    { date: '2026.01.15', type: '긴급 점검', result: '스핀들 진동 경고' },
                    { date: '2025.08.12', type: '정기 점검', result: '정상 가동' }
                ]
            },
            'ys080': {
                name: '현대로보틱스 YS080',
                type: '산업용 로봇',
                image: 'assets/equipment/현대로보틱스 YS080.png',
                healthScore: 94,
                lifespan: 15.0,
                efficiency: 92,
                nextCheck: '2026.05.01',
                vibration: 0.5,
                components: [
                    { name: '감속기 (J1)', health: 92, replaceIn: '3년' },
                    { name: '서보 앰프', health: 98, replaceIn: '7년' }
                ],
                history: [
                    { date: '2026.01.20', type: 'AI 진단 리포트', result: '매우 안정적 (궤적 오차 0.01mm)' }
                ]
            },
            'as50': {
                name: '경원기계 AS-50',
                type: '에어 컴프레서',
                image: 'assets/equipment/경원기계 AS-50.png',
                healthScore: 45,
                lifespan: 1.5,
                efficiency: 72,
                nextCheck: '2026.02.15',
                vibration: 3.8,
                components: [
                    { name: '에어엔드', health: 40, replaceIn: '즉시 교체 권장' },
                    { name: '흡입 밸브', health: 60, replaceIn: '1년' }
                ],
                history: [
                    { date: '2026.02.10', type: '경고 알림', result: '토출 온도 과열 및 이상 소음' },
                    { date: '2025.12.01', type: '정기 점검', result: '오일 누유 확인됨' }
                ]
            }
        }
    },

    // UI Helpers
    ui: {
        history: [
            { id: 1, name: 'Pump #03', status: 'normal', date: '14:20' },
            { id: 2, name: 'Fan #12', status: 'danger', date: '11:05' },
            { id: 3, name: 'Motor #01', status: 'normal', date: '09:30' }
        ],

        renderHistoryList() {
            const list = document.getElementById('history-list');
            if (list) {
                list.innerHTML = this.history.map(item => `
                    <div class="history-item ${item.status === 'danger' ? 'danger' : ''}">
                        <div>
                            <strong>${item.name}</strong>
                            <div style="font-size: 0.8rem; color: #94a3b8;">${item.date} 점검</div>
                        </div>
                        <span style="color: ${item.status === 'danger' ? '#ef4444' : '#10b981'}; font-weight: 600;">
                            ${item.status === 'danger' ? '위험' : '정상'}
                        </span>
                    </div>
                `).join('');
            }
        },

        addHistory(isSafe) {
            this.history.unshift({
                id: Date.now(),
                name: 'Test Device',
                status: isSafe ? 'normal' : 'danger',
                date: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            });
            // Keep only recent 5
            if (this.history.length > 5) this.history.pop();
        }
    }
};

// Start App
document.addEventListener('DOMContentLoaded', () => {
    app.router.init();
});
