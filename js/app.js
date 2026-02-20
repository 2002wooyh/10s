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
                // Determine counts and scores from DOM (or Data)
                const cards = document.querySelectorAll('.equip-card');
                const total = cards.length;
                let safe = 0, warning = 0, danger = 0;
                let totalScore = 0;

                cards.forEach(card => {
                    const badge = card.querySelector('.status-badge');
                    if (badge.classList.contains('safe')) safe++;
                    else if (badge.classList.contains('warning')) warning++;
                    else if (badge.classList.contains('danger')) danger++;

                    // Mock score based on status for demo visualization
                    // In real app, this would come from app.data.equipment
                    if (badge.classList.contains('safe')) totalScore += 95;
                    else if (badge.classList.contains('warning')) totalScore += 75;
                    else if (badge.classList.contains('danger')) totalScore += 45;
                });

                const avgEfficiency = total > 0 ? Math.round(totalScore / total) : 0;

                // Update Stats Grid
                const elSafe = document.getElementById('sheet-count-safe');
                const elWarning = document.getElementById('sheet-count-warning');
                const elDanger = document.getElementById('sheet-count-danger');
                if (elSafe) elSafe.innerText = safe;
                if (elWarning) elWarning.innerText = warning;
                if (elDanger) elDanger.innerText = danger;

                // Update Average Text
                const elTotalEff = document.getElementById('total-efficiency');
                if (elTotalEff) elTotalEff.innerText = `${avgEfficiency}%`;

                // Update Donut Chart Gradient (Gauge Style)
                const chart = document.getElementById('efficiency-chart');
                // Reset to 0% initially (animation will handle the rest)
                this.currentEfficiencyVal = avgEfficiency;

                // Initial state is empty
                const emptyColor = '#eee';
                chart.style.background = `conic-gradient(
                        var(--accent) 0% 0%, 
                        ${emptyColor} 0% 100%
                    )`;

                // Populate Clean Equipment List
                const listContainer = document.getElementById('sheet-equipment-list');
                if (!listContainer) return;

                listContainer.innerHTML = ''; // Clear existing

                cards.forEach(card => {
                    const name = card.querySelector('h3').innerText;
                    const type = card.querySelector('p').innerText;
                    const badge = card.querySelector('.status-badge');

                    let score = 95;
                    // Neutral Color
                    let colorVar = '#333';

                    if (badge.classList.contains('warning')) {
                        score = 75;
                    }
                    if (badge.classList.contains('danger')) {
                        score = 45;
                    }

                    const itemHtml = `
                        <div class="clean-list-item" onclick="${card.getAttribute('onclick')}" data-score="${score}">
                            <div class="clean-item-header">
                                <div>
                                    <span class="clean-item-name">${name}</span>
                                    <span class="clean-item-type">${type}</span>
                                </div>
                                <span class="clean-item-score" style="color: var(--text-main)">0%</span>
                            </div>
                            <div class="clean-item-bar-bg">
                                <div class="clean-item-bar-fill" style="width: 0%; background: #333"></div>
                            </div>
                        </div>
                    `;
                    listContainer.insertAdjacentHTML('beforeend', itemHtml);
                });

                // Initialize Observer for scroll animation
                this.initListObserver();
            },



            // Observer for List Animation because user wants "scroll" trigger
            initListObserver() {
                const options = {
                    root: document.querySelector('.sheet-content'),
                    threshold: 0.1
                };

                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const item = entry.target;
                            if (item.classList.contains('played')) return; // Already played

                            item.classList.add('played');
                            const targetScore = parseInt(item.dataset.score);

                            // Animate Bar
                            const bar = item.querySelector('.clean-item-bar-fill');
                            bar.style.width = targetScore + '%';
                            bar.style.transition = 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)';

                            // Animate Number
                            const scoreEl = item.querySelector('.clean-item-score');
                            this.animateNumber(scoreEl, 0, targetScore, 1200);
                        }
                    });
                }, options);

                const items = document.querySelectorAll('.clean-list-item');
                items.forEach(item => observer.observe(item));
            },

            animateNumber(el, start, end, duration) {
                const startTime = performance.now();
                const animate = (time) => {
                    const elapsed = time - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    // Ease out Quartic
                    const ease = 1 - Math.pow(1 - progress, 4);
                    const current = Math.round(start + (end - start) * ease);
                    el.innerText = current + '%';

                    if (progress < 1) requestAnimationFrame(animate);
                };
                requestAnimationFrame(animate);
            },

            resetEquipmentList() {
                const items = document.querySelectorAll('.clean-list-item');
                items.forEach(item => {
                    item.classList.remove('played');
                    // Reset Bar
                    const bar = item.querySelector('.clean-item-bar-fill');
                    bar.style.transition = 'none'; // Instant reset
                    bar.style.width = '0%';

                    // Reset Number
                    const scoreEl = item.querySelector('.clean-item-score');
                    scoreEl.innerText = '0%';
                });
            },

            initBottomSheet() {
                const sheet = document.getElementById('equipment-sheet');
                if (!sheet) return;

                // Force re-initialization with v2 flag
                if (sheet.hasAttribute('data-initialized-v2')) return;
                sheet.setAttribute('data-initialized-v2', 'true');

                const content = sheet.querySelector('.sheet-content');
                const handle = sheet.querySelector('.sheet-handle-wrapper');
                const header = sheet.querySelector('.sheet-header');

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
                            this.animateChart(this.currentEfficiencyVal || 78);
                        } else if (deltaY > 0 && expanded) {
                            sheet.classList.remove('expanded');
                            // Reset Animation
                            this.animateChart(0);
                            this.resetEquipmentList(); // Reset List
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
                            this.animateChart(this.currentEfficiencyVal || 78);
                        }
                        else if (deltaY > 0 && expanded) {
                            sheet.classList.remove('expanded');
                            this.animateChart(0);
                            this.resetEquipmentList(); // Reset List
                        }
                    }
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

                // Emotional Theme Colors
                let themeColor = 'var(--accent)'; // Default Blue
                let themeSoft = 'rgba(93, 156, 236, 0.15)';
                let statusText = '최적의 상태';
                let statusSub = '완벽한 상태입니다';
                let startColor = '#4facfe'; // Blue
                let endColor = '#00f2fe';   // Cyan

                if (data.healthScore < 80) {
                    themeColor = '#ff6b6b'; // Red
                    themeSoft = 'rgba(255, 107, 107, 0.15)';
                    statusText = '심각한 위험';
                    statusSub = '점검이 시급합니다';
                    startColor = '#ff9a9e';
                    endColor = '#fecfef';
                } else if (data.healthScore < 90) {
                    themeColor = '#fbc02d'; // Yellow
                    themeSoft = 'rgba(251, 192, 45, 0.15)';
                    statusText = '점검 필요';
                    statusSub = '주의가 필요합니다';
                    startColor = '#f6d365';
                    endColor = '#fda085';
                }

                // Components HTML (Biosignal Lines)
                let componentHtml = '';
                data.components.forEach((comp, index) => {
                    let compColor = themeColor;
                    if (comp.health < 40) compColor = '#ff6b6b';

                    componentHtml += `
                        <div class="bio-row" style="animation-delay: ${0.2 + (index * 0.1)}s">
                            <div class="bio-info">
                                <span class="bio-name">${comp.name}</span>
                                <span class="bio-status">${comp.replaceIn} 교체 권장</span>
                            </div>
                            <div class="bio-visual">
                                <div class="bio-line-bg">
                                    <div class="bio-line-fill" style="width: ${comp.health}%; background: ${compColor}; box-shadow: 0 0 10px ${compColor};"></div>
                                </div>
                                <span class="bio-score" style="color: ${compColor}">${comp.health}%</span>
                            </div>
                        </div>
                    `;
                });

                // Timeline HTML
                let historyHtml = '';
                data.history.forEach((hist, index) => {
                    historyHtml += `
                        <div class="story-item" style="animation-delay: ${0.5 + (index * 0.1)}s">
                            <div class="story-dot" style="background: ${themeColor}"></div>
                            <div class="story-content">
                                <span class="story-date">${hist.date}</span>
                                <span class="story-desc">${hist.type} · ${hist.result}</span>
                            </div>
                        </div>
                    `;
                });

                // Determine Badge Class & Text
                let badgeClass = 'safe';
                let badgeText = '정상';

                if (data.healthScore < 80) {
                    badgeClass = 'danger';
                    badgeText = '위험';
                } else if (data.healthScore < 90) {
                    badgeClass = 'warning';
                    badgeText = '주의';
                }

                // --- Page 1: Overview (Hero + Score + Comment) ---
                const page1Html = `
                    <div class="report-page" id="report-page-1">
                        <!-- Hero Section -->
                        <div class="emotional-hero">
                             <div class="floating-image-wrapper">
                                <img src="${data.image}" alt="${data.name}" class="floating-image">
                                <span class="status-badge ${badgeClass}">${badgeText}</span>
                            </div>
                            <div class="hero-text">
                                <h1 class="hero-title" style="font-size: 1.8rem; margin-bottom: 4px;">${data.name}</h1>
                                <span class="hero-category" style="font-size: 1rem; color: var(--text-sub);">${data.type}</span>
                                
                                <!-- Emotional Donut Gauge -->
                                <div class="soul-ring-wrapper" style="margin: 15px auto; position: relative; width: 180px; height: 180px;">
                                    <svg class="soul-ring" width="180" height="180" viewBox="0 0 220 220" style="transform: rotate(-90deg);">
                                        <defs>
                                            <linearGradient id="emotionalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" style="stop-color: #4facfe; stop-opacity: 1" />
                                                <stop offset="100%" style="stop-color: #00f2fe; stop-opacity: 1" />
                                            </linearGradient>
                                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                                                <feMerge>
                                                    <feMergeNode in="coloredBlur" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>
                                        </defs>
                                        <!-- Background Ring -->
                                        <circle cx="110" cy="110" r="90" fill="transparent" stroke="#f0f2f5" stroke-width="20" stroke-linecap="round"></circle>
                                        <!-- Progress Ring -->
                                        <circle id="emotional-gauge-progress" cx="110" cy="110" r="90" fill="transparent" stroke="url(#emotionalGradient)" stroke-width="20" stroke-linecap="round" 
                                            style="stroke-dasharray: ${2 * Math.PI * 90}; stroke-dashoffset: ${2 * Math.PI * 90}; filter: url(#glow); transition: stroke-dashoffset 1.5s ease-out;"></circle>
                                    </svg>
                                    <div class="soul-score" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                                        <span id="emotional-score-value" class="score-val" style="font-size: 3.2rem; font-weight: 700; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -2px;">0</span>
                                        <span class="score-label" style="display: block; font-size: 0.85rem; color: #888; font-weight: 500; margin-top: -5px;">AI 진단 점수</span>
                                    </div>
                                    <script>
                                        setTimeout(() => {
                                            const targetScore = ${data.healthScore};
                                            const circumference = 2 * Math.PI * 90;
                                            const offset = circumference * (1 - targetScore / 100);
                                            
                                            // Animate Gauge
                                            document.getElementById('emotional-gauge-progress').style.strokeDashoffset = offset;
                                            
                                            // Animate Score Counter
                                            const scoreElement = document.getElementById('emotional-score-value');
                                            let currentScore = 0;
                                            const duration = 1500; // 1.5s
                                            const startTime = performance.now();
                                            
                                            function updateScore(currentTime) {
                                                const elapsed = currentTime - startTime;
                                                const progress = Math.min(elapsed / duration, 1);
                                                
                                                // Ease-out function
                                                const easeOut = 1 - Math.pow(1 - progress, 3);
                                                
                                                currentScore = Math.floor(easeOut * targetScore);
                                                scoreElement.innerText = currentScore;
                                                
                                                if (progress < 1) {
                                                    requestAnimationFrame(updateScore);
                                                } else {
                                                    scoreElement.innerText = targetScore;
                                                }
                                            }
                                            requestAnimationFrame(updateScore);
                                        }, 300); // Start after 300ms delay
                                    </script>
                                </div>
                            </div>
                        </div>

                        <!-- Scroll Hint -->
                           <div style="margin-top: auto; margin-bottom: 40px; text-align: center; color: #ccc; animation: bounce 2s infinite;">
                                <i class="fa-solid fa-chevron-down"></i>
                            </div>
                    </div>
                `;

                // --- Page 2: Detailed Analysis (Gauge + Metrics + Graphs) ---

                // Mock Data for Graphs
                const mockGraphWave = `M0,50 Q10,40 20,50 T40,50 T60,50 T80,50 T100,50 T120,50 T140,50 T160,50 T180,50 T200,50 T220,50 T240,50 T260,50 T280,50 T300,50`;
                const wavePath = "M0,30 Q20,10 40,30 T80,30 T120,30 T160,30 T200,30 T240,30 T280,30 T320,30";

                // Bars for FFT
                let fftBars = '';
                for (let i = 0; i < 30; i++) {
                    let h = Math.random() * 40 + 10;
                    if (data.healthScore < 80 && i > 25) h += 40; // High freq anomaly
                    fftBars += `<rect x="${i * 10}" y="${100 - h}" width="6" height="${h}" fill="${themeColor}" opacity="0.6" rx="2" />`;
                }

                const page2Html = `
                    <div class="report-page" id="report-page-2">
                        <!-- Soul Gauge Section (Refactored: Side-by-Side) -->
                        <div class="soul-gauge-section" style="margin-top: 0; padding-top: 0; display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 40px; padding-left: 20px;">
                            <!-- Left: Gauge -->
                            <div class="soul-ring-wrapper">
                                <svg class="soul-ring" width="160" height="160">
                                    <circle class="soul-ring-bg" stroke="#eee" stroke-width="8" fill="transparent" r="70" cx="80" cy="80"></circle>
                                    <circle class="soul-ring-progress" stroke="${themeColor}" stroke-width="8" fill="transparent" r="70" cx="80" cy="80"
                                        style="stroke-dasharray: 440; stroke-dashoffset: ${440 - (440 * data.healthScore / 100)};"></circle>
                                </svg>
                                <div class="soul-score">
                                    <span class="score-val" style="color: ${themeColor}">${data.healthScore}</span>
                                    <span class="score-label">AI 진단 점수</span>
                                </div>
                            </div>
                            
                            <!-- Right: Metrics (Vertical Layout for Side) -->
                            <div class="soul-metrics" style="flex-direction: column; gap: 20px; align-items: flex-start;">
                                <div class="s-metric" style="text-align: left;">
                                    <span class="sm-label" style="font-size: 0.9rem;">효율</span>
                                    <span class="sm-val" style="font-size: 1.4rem;">${data.efficiency}%</span>
                                </div>
                                <div class="sm-divider" style="width: 100%; height: 1px; background: rgba(0,0,0,0.05);"></div>
                                <div class="s-metric" style="text-align: left;">
                                    <span class="sm-label" style="font-size: 0.9rem;">수명</span>
                                    <span class="sm-val" style="font-size: 1.4rem;">${data.lifespan}년</span>
                                </div>
                            </div>
                        </div>

                        <div class="glass-panel">
                            <!-- Title Removed as requested -->
                            
                            <!-- Graph 1: Time Domain -->
                            <div class="graph-box" style="margin-bottom: 20px;">
                                <span class="graph-label">주파수 파형 (Time Domain)</span>
                                <svg width="100%" height="80" viewBox="0 0 320 80" style="background: rgba(0,0,0,0.02); border-radius: 12px;">
                                    <path d="${wavePath}" fill="none" stroke="${themeColor}" stroke-width="2" />
                                </svg>
                            </div>

                            <!-- Graph 2: FFT -->
                            <div class="graph-box" style="margin-bottom: 20px;">
                                <span class="graph-label">주파수 스펙트럼 (FFT)</span>
                                <svg width="100%" height="100" viewBox="0 0 300 100" style="background: rgba(0,0,0,0.02); border-radius: 12px;">
                                    ${fftBars}
                                </svg>
                            </div>

                            <!-- Anomalies -->
                            <div class="anomaly-box">
                                <span class="graph-label">감지된 이상 주파수</span>
                                <div style="display: flex; gap: 8px; margin-top: 8px;">
                                    ${data.healthScore < 90 ?
                        `<span class="status-badge danger" style="position: relative; top:0; left:0; display: inline-block;">1.2kHz (베어링)</span>
                                         <span class="status-badge warning" style="position: relative; top:0; left:0; display: inline-block;">60Hz (전원)</span>`
                        : `<span class="status-badge safe" style="position: relative; top:0; left:0; display: inline-block; background: #E3F2FD; color: #5D9CEC;">이상 없음</span>`
                    }
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                // --- Page 3: Components & History ---
                const page3Html = `
                    <div class="report-page" id="report-page-3">
                         <div class="glass-panel" style="margin-top: 20px;">
                            <h3 class="panel-title">부품별 상태</h3>
                            ${componentHtml}
                        </div>

                        <div class="glass-panel">
                            <h3 class="panel-title">최근 점검 내역</h3>
                            <div class="story-line">
                                ${historyHtml}
                            </div>
                        </div>
                         <!-- End message -->
                        <div style="text-align: center; margin-top: 40px; opacity: 0.5;">
                            <p style="font-size: 0.9rem;">리포트의 끝입니다.</p>
                        </div>
                    </div>
                `;

                const html = `
                    <div class="emotional-container">
                        <!-- Fixed Nav -->
                        <div class="emotional-nav">
                            <button onclick="app.router.navigate('management')"><i class="fa-solid fa-chevron-left"></i></button>
                            <span class="nav-title">AI 분석 리포트</span>
                        </div>

                        <!-- Scroll Snap Container -->
                        <div class="report-scroll-container">
                            ${page1Html}
                            ${page2Html}
                            ${page3Html}
                        </div>
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
