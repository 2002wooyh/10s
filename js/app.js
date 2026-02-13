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

                const html = `
                    <div class="result-card ${isSafe ? 'safe' : 'danger'}">
                        <div class="icon-wrapper"><i class="fa-solid ${isSafe ? 'fa-check' : 'fa-triangle-exclamation'}"></i></div>
                        <h3>${isSafe ? '정상 (Safe)' : '점검 필요 (Warning)'}</h3>
                        <p>${isSafe ? '설비 진동 및 소음 패턴이<br>정상 범위 이내입니다.' : '비정상 진동 패턴이 감지되었습니다.<br>베어링 마모가 의심됩니다.'}</p>
                        <div class="data-box">
                            <span>${isSafe ? '신뢰도' : '위험도'}</span>
                            <strong>${isSafe ? '98.5%' : 'High'}</strong>
                        </div>
                    </div>
                    <button class="btn-primary" onclick="app.router.navigate('home')">${isSafe ? '홈으로 돌아가기' : '재진단 수행'}</button>
                    <button class="btn-secondary" onclick="app.router.navigate('management')">${isSafe ? '상세 리포트 보기' : '정비 이력 확인'}</button>
                `;

                if (container) container.innerHTML = html;

                // Add to history
                app.ui.addHistory(isSafe);
            }
        },

        management: {
            onEnter() {
                this.initDragScroll();
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

                // Color logic for health score
                let scoreColor = '#0095f6'; // Safe (Blue)
                let scoreText = '매우 양호';
                if (data.healthScore < 80) { scoreColor = '#fa4454'; scoreText = '점검 필요'; }
                else if (data.healthScore < 90) { scoreColor = '#fbad50'; scoreText = '주의'; } // Orange

                let componentHtml = '';
                data.components.forEach(comp => {
                    let color = '#0095f6';
                    if (comp.health < 40) color = '#fa4454';
                    else if (comp.health < 70) color = '#fbad50';

                    componentHtml += `
                        <div class="component-item">
                            <div class="comp-header">
                                <span>${comp.name}</span>
                                <span class="comp-status" style="color:${color}">${comp.health}% (교체 D-${comp.replaceIn})</span>
                            </div>
                            <div class="progress-bg">
                                <div class="progress-fill" style="width: ${comp.health}%; background: ${color}"></div>
                            </div>
                        </div>
                    `;
                });

                let historyHtml = '';
                data.history.forEach((hist, index) => {
                    const activeClass = index === 0 ? 'active' : '';
                    historyHtml += `
                        <div class="timeline-item">
                            <div class="timeline-marker ${activeClass}"></div>
                            <div class="timeline-content">
                                <h4>${hist.date} - ${hist.type}</h4>
                                <span>${hist.result}</span>
                            </div>
                        </div>
                    `;
                });

                const html = `
                    <div class="report-hero">
                        <img src="${data.image}" alt="${data.name}">
                        <h2>${data.name}</h2>
                        <p>${data.type}</p>
                        <div class="health-score-container">
                            <div class="health-score-badge" style="background: ${scoreColor}">${data.healthScore}점</div>
                            <span class="health-score-label">AI 종합 진단: ${scoreText}</span>
                        </div>
                    </div>

                    <div class="section-title">핵심 진단 지표</div>
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <span class="metric-value">${data.lifespan}년</span>
                            <span class="metric-label">잔여 수명 예측</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-value">${data.efficiency}%</span>
                            <span class="metric-label">운전 효율</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-value">${data.nextCheck}</span>
                            <span class="metric-label">다음 정기 점검</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-value">${data.vibration}mm/s</span>
                            <span class="metric-label">평균 진동 수치</span>
                        </div>
                    </div>

                    <div class="section-title">주요 부품 상태</div>
                    <div class="component-list">
                        ${componentHtml}
                    </div>

                    <div class="section-title">최근 점검 이력</div>
                    <div class="timeline">
                        ${historyHtml}
                    </div>
                `;

                container.innerHTML = html;
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
