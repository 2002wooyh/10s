(() => {
    'use strict';

    const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
    const gasQuestion = /가스|유량|보호기체|l\s*\/\s*min/iu;
    const conditionTopics = {
        current: /전류|amperage|welding\s*current/iu,
        voltage: /전압|voltage/iu,
        wireFeedSpeed: /와이어\s*(송급|공급|이송)|송급\s*속도|\bwfs\b|wire\s*feed/iu,
        ctwd: /\bctwd\b|콘택트\s*팁|접촉\s*팁|팁과\s*모재/iu,
        travelSpeed: /(?:용접|이송|토치)\s*속도|travel\s*speed/iu
    };
    const chatDate = new Intl.DateTimeFormat('ko-KR', {
        month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit'
    });
    const questionHeading = '궁금한 점을 AI에 물어보세요.';
    const sendIcon = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>';

    function composer({ placeholder = questionHeading, value = '', label = '질문 입력' } = {}) {
        return '<form class="report-chat-composer" data-report-chat-composer>' +
            '<span class="report-chat-composer-icon" aria-hidden="true">' + (globalThis.DemoIcon?.('waveform', 20) || '') + '</span>' +
            '<input data-report-chat-input type="text" name="question" maxlength="240" autocomplete="off" ' +
            'enterkeyhint="send" aria-label="' + escape(label) + '" placeholder="' + escape(placeholder) +
            '" value="' + escape(value) + '">' +
            '<button data-report-chat-send type="submit" aria-label="질문 보내기"' + (value.trim() ? '' : ' disabled') +
            '>' + sendIcon + '</button></form>';
    }

    function bindComposer(form, onSubmit) {
        const input = form.querySelector('[data-report-chat-input]');
        const send = form.querySelector('[data-report-chat-send]');
        const events = new AbortController();
        const options = { signal: events.signal };
        let composing = false;
        function refresh() {
            send.disabled = !input.value.trim() || composing || form.hasAttribute('data-chat-busy');
        }
        input.addEventListener('input', refresh, options);
        input.addEventListener('compositionstart', () => { composing = true; refresh(); }, options);
        input.addEventListener('compositionend', () => { composing = false; refresh(); }, options);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const question = input.value.trim();
            if (composing || !question || form.hasAttribute('data-chat-busy')) return;
            input.value = '';
            refresh();
            onSubmit(question);
        }, options);
        refresh();
        return { refresh, dispose: () => events.abort() };
    }

    function questions({ id = 'report-chat-questions-title', questions: suggestions = [] } = {}) {
        const rows = suggestions.filter(question => typeof question === 'string' && question.trim())
            .map(question => '<li><button class="report-chat-question" type="button" data-report-chat-question="' +
                escape(question) + '">' + escape(question) + '</button></li>').join('');
        return '<section class="report-chat-questions" data-report-chat-questions aria-labelledby="' + escape(id) + '">' +
            '<h3 id="' + escape(id) + '">' + questionHeading + '</h3>' +
            (rows ? '<ul class="report-chat-suggestions">' + rows + '</ul>' : '') +
            composer({ placeholder: '질문을 입력하세요', label: questionHeading }) + '</section>';
    }

    function bindQuestions(section, onQuestion) {
        const events = new AbortController();
        section.addEventListener('click', event => {
            const suggestion = event.target.closest('[data-report-chat-question]');
            if (suggestion) onQuestion(suggestion.dataset.reportChatQuestion);
        }, { signal: events.signal });
        const { dispose } = bindComposer(section.querySelector('[data-report-chat-composer]'), onQuestion);
        return () => { events.abort(); dispose(); };
    }

    function conversationTitle(question) {
        const text = question?.trim().replace(/\s+/gu, ' ').replace(/[?!？。]+$/u, '');
        if (!text) return '새 대화';
        const topics = [
            [/^([\d.,]+\s*Hz)는 어떤 의미인가요$/iu, match => match[1] + '의 의미'],
            [/^가스 유량은 어떻게 확인해요$/u, '보호가스 유량 확인'],
            [/^아크가 왜 불안정한가요$/u, '아크 불안정 확인'],
            [/^(용접|공정)\s*조건은 (어떤가요|어떻게 확인해요|무엇인가요)$/u, '용접 조건 확인'],
            [/^스패터는 어디를 봐야 하나요$/u, '스패터 확인 방법'],
            [/^(?:(?:종합|참고|점검|분석) )?점수는 (어떻게 계산했나요|어떤 의미인가요)$/u, '종합 점수의 의미'],
            [/^다음 점검에서(는 뭘 비교해요| 뭘 확인해요)$/u, '다음 점검 항목'],
            [/^어떤 장비인가요$/u, '장비 소개'],
            [/^어디에서 소리를 측정하나요$/u, '가동음 측정 위치'],
            [/^최근 분석은 어땠나요$/u, '최근 분석 결과'],
            [/^첫 점검은 어떻게 시작하나요$/u, '첫 점검 방법'],
            [/^정비 판단에 어떻게 써요$/u, '리포트를 활용한 정비 판단'],
            [/^녹음은 (얼마나 길어요|몇 초인가요)$/u, '녹음 길이']
        ];
        for (const [pattern, title] of topics) {
            const match = text.match(pattern);
            if (match) return typeof title === 'function' ? title(match) : title;
        }
        const characters = Array.from(text);
        return characters.length > 32 ? characters.slice(0, 32).join('').trimEnd() + '…' : text;
    }

    function bubble(role, content) {
        const speaker = role === 'user' ? '나' : '10초만 AI';
        return '<li class="report-chat-message" data-role="' + role + '">' +
            '<span class="visually-hidden">' + speaker + '</span>' +
            '<p class="report-chat-bubble">' + escape(content) + '</p></li>';
    }

    function render() {
        const startedAt = new Date();
        return '<section class="report-chat" data-report-chat aria-label="질문 대화">' +
            '<ol class="report-chat-log" data-report-chat-log aria-label="대화 내용">' +
            '<li class="report-chat-start"><time datetime="' + startedAt.toISOString() + '">' +
            escape(chatDate.format(startedAt)) + '</time></li></ol>' +
            '<p class="visually-hidden" data-report-chat-announcement role="status" aria-atomic="true"></p>' +
            '<div class="report-chat-dock">' + composer() + '</div></section>';
    }

    function equipmentAnswer(topic, referringBack, device, report) {
        const name = device?.name || report?.deviceName || '이 장비';
        const model = device?.model || report?.model;
        const point = device?.point || report?.point;
        const details = device?.details?.trim();
        const steps = report?.nextChecks?.filter(Boolean).slice(0, 2);
        const evidence = report?.peaks?.filter(peak => Number.isFinite(peak.hz) && Number.isFinite(peak.change))
            .reduce((largest, peak) => !largest || Math.abs(peak.change) > Math.abs(largest.change) ? peak : largest, null);

        if (/첫\s*점검|처음\s*(점검|측정)|점검.*시작/iu.test(topic)) {
            return [point ? '먼저 등록된 측정 위치인 ‘' + point + '’와 장비의 운전 조건을 확인해 주세요.' :
                '먼저 소리를 기록할 위치와 장비의 운전 조건을 정해 주세요.',
            '같은 위치에서 가동음을 기록해 두면 다음 점검 때 비교 기준으로 쓸 수 있어요.'].join(' ');
        }
        if (/주파수|그래프|피크|hz|근거/iu.test(topic)) {
            if (!evidence) return name + '의 등록 정보에는 주파수 비교값이 없어요. 점검 리포트가 생기면 주파수별 변화를 확인할 수 있어요.';
            const sign = evidence.change > 0 ? '+' : '';
            const finding = number.format(evidence.hz) + ' Hz에서 기준음 대비 ' + sign + number.format(evidence.change) + ' dB 변화가 기록됐어요.';
            if (!referringBack) return finding;
            const comparison = '회색 점선은 기준음, 파란 실선은 비교음이에요. 같은 주파수에서 두 선의 높이 차이를 살펴보세요.';
            return [finding, report.point ? '측정 위치는 ‘' + report.point + '’예요.' : '', comparison].filter(Boolean).join(' ');
        }
        if (/다음|재측정|측정\s*위치|어디|방법|조건/iu.test(topic)) {
            return [point ? '등록된 측정 위치는 ‘' + point + '’예요.' : '', steps?.join(' ') ||
                '다음에 비교할 수 있도록 측정 위치와 운전 조건을 함께 기록해 두세요.'].filter(Boolean).join(' ');
        }
        if (/정상|이상|분석|결과|상태|기록|리포트/iu.test(topic)) {
            if (report?.summary) return name + '의 최근 분석이에요.\n\n' + report.summary;
            return name + '의 저장된 분석 리포트가 아직 없어요. 등록된 장비 정보는 상세 화면에서 볼 수 있어요.';
        }
        const identification = model ? name + '의 등록 모델은 ' + model + '이에요.' : '등록된 장비 이름은 ' + name + '이에요.';
        return [identification, details || (point ? '등록된 측정 위치는 ‘' + point + '’예요.' : '')].filter(Boolean).join('\n\n');
    }

    function weldingConditionsAnswer(topic, referringBack, conditions) {
        const requested = conditions.filter(condition => conditionTopics[condition.key]?.test(topic));
        const general = /(?:용접|공정|운전|작업)\s*조건|(?:장비|용접)\s*설정|설정값|^조건(?:은|이|을)?(?=\s|[?!.]|$)/iu.test(topic);
        const includesGas = gasQuestion.test(topic);
        if (includesGas && !requested.length) return '';
        const rows = requested.length ? requested : general ? conditions : [];
        if (includesGas) rows.push(...conditions.filter(condition => condition.key === 'gasFlow'));
        if (!rows.length) return '';

        const values = rows.map(({ key, label, value, unit, status }) => {
            const formatted = key === 'wireFeedSpeed' ? Number(value).toFixed(1) : number.format(value);
            return label + ' ' + formatted + ' ' + unit + (status ? ' (' + status + ')' : '');
        }).join(', ');
        return '리포트의 조건별 추정값은 ' + values + '예요. ' + (referringBack ?
            '전류·전압과 송급 속도는 장비 기록에서, CTWD와 용접 속도는 작업 기록에서 확인해요.' :
            '실제 값은 장비 표시나 작업 기록과 대조해 주세요.');
    }

    function reportAnswer(question, history, report, device, welding) {
        const text = question.normalize('NFKC');
        const followUp = /^(그래서|그러면|그럼|그건|그게|그 부분|그 수치|왜요|어떻게요|더 자세히)/u;
        const previous = history.slice(0, -1).findLast(message =>
            message.role === 'user' && !followUp.test(message.content.normalize('NFKC')))?.content || '';
        const referringBack = followUp.test(text);
        const topic = referringBack ? text + ' ' + previous.normalize('NFKC') : text;

        const recordingQuestion = /주파수|피크|fft|그래프|파형|dbfs|hz|녹음\s*(길이|시간)/iu.test(topic);
        if (!welding && !(report?.recording === 'welding-demo' && recordingQuestion)) {
            return equipmentAnswer(topic, referringBack, device, report);
        }

        const signal = globalThis.WeldingSignal;
        const assessment = globalThis.WeldingCase;
        const conditionsAnswer = weldingConditionsAnswer(topic, referringBack, assessment.conditions);
        if (conditionsAnswer) return conditionsAnswer;
        const { gas, spatter } = assessment;
        const gasStatus = assessment.conditions.find(condition => condition.key === 'gasFlow')?.status;
        const gasStatusNote = gasStatus ? ' 리포트에는 ‘' + gasStatus + '’으로 표시했어요.' : '';
        const gasPeak = assessment.gasPeak(signal);
        const gasChange = assessment.gasChangeDb(signal);
        const signedGasChange = (gasChange > 0 ? '+' : '') + number.format(gasChange) + ' dB';
        const gasRange = gas.band.map(frequency => number.format(frequency)).join('~') + ' Hz';
        const spatterRange = spatter.band.map(frequency => number.format(frequency)).join('~') + ' Hz';
        const replies = [
            [/점수|감점|산정|\d+\s*점/iu,
                assessment.scoreLabel + '는 ' + assessment.score + '/' + assessment.maxScore + '점이에요. 점검 우선순위를 보여주며, 이 리포트에서는 아크 상태를 먼저 확인해요.',
                '10초 녹음에서는 FFT 주파수와 디지털 레벨을 확인할 수 있어요. 용접 품질을 판단하려면 작업 영상, 전류·전압 기록, 비드 형상을 함께 살펴보세요.'],
            [/아크|\barc\b/iu,
                '리포트에서는 아크 불안정 가능성을 먼저 확인해요. 아크가 흔들리면 소리가 불규칙해지고 스패터가 동반될 수 있어요. 작업 영상이나 전류·전압 기록을 함께 보면 실제 상태를 확인하는 데 도움이 돼요.',
                '같은 작업 구간의 소리와 전류·전압 기록을 나란히 보세요. 아크가 흔들리는 시점에 영상에서 금속 방울이 튀는지 확인하면 스패터도 함께 살펴볼 수 있어요.'],
            [gasQuestion,
                gasRange + '에서 가장 큰 성분은 ' + number.format(gasPeak.frequencyHz) + ' Hz, ' + number.format(gasPeak.dbFS) + ' dBFS예요. 비교 기준 ' + gas.referenceDbFS + ' dBFS와의 차이는 ' + signedGasChange + '예요. ' +
                    '유량 비교 기준은 ' + gas.referenceFlow + ' L/min, 리포트의 추정값은 ' + gas.estimatedFlow + ' L/min이에요.' + gasStatusNote,
                '유량계의 표시값을 L/min으로 기록해 실제 유량을 확인해요. ' + gas.estimatedFlow + ' L/min은 리포트에 표시된 추정값이고, ' + signedGasChange + '는 가동음의 차이예요.'],
            [/스패터|스파터|스펙터|spatter|금속\s*방울/iu,
                '스패터는 아크가 불안정할 때 동반될 수 있는 금속 방울이에요. 리포트에서는 ' + spatterRange + ' 대역을 살펴봐요. 비교 기준은 ' + spatter.referenceCount + '회, 추정값은 ' + spatter.estimatedCount + '회예요. 실제 횟수는 작업 영상에서 확인해요.',
                '작업 영상에서 금속 방울이 튀는 시각을 적고 시간 파형의 같은 시각과 비교해 보세요. 실제 횟수는 영상에서 센 값으로 확인해요.'],
            [/험핑|용락|humping|burn\s*through|구멍/iu,
                '험핑은 용접 비드가 물결처럼 반복해서 솟는 모양이에요. 리포트에서는 가능성을 살펴보도록 안내해요. 실제 여부는 비드 사진이나 작업 영상으로 확인해요.',
                '비드의 길이 방향을 따라 반복적으로 높아지는 부분이 있는지 확인해요. 소재를 관통한 구멍이 있다면 용락 가능성을 별도로 확인할 수 있어요.'],
            [/주파수|피크|fft|그래프|파형|dbfs|hz/iu,
                '이 녹음에서 가장 큰 주파수 성분은 ' + number.format(signal.fft.peakHz) + ' Hz이고, 레벨은 ' + number.format(signal.fft.peakDbFS) + ' dBFS예요. 특정 결함을 확인하려면 같은 조건의 기준음과 작업 기록을 비교해야 해요.',
                'Hz는 초당 진동 횟수이고, dBFS는 이 파일에서 표현할 수 있는 최대 크기에 대한 디지털 레벨이에요. 다음 녹음도 같은 위치와 장치 설정에서 찍어 비교해 보세요.'],
            [/녹음|재생|길이|시간|샘플링/iu,
                '용접 녹음은 ' + number.format(signal.durationSeconds) + '초예요. 리포트 위쪽의 ‘다시 듣기’로 재생하거나 원하는 구간으로 이동할 수 있어요.',
                '시간 파형에서 듣고 싶은 구간의 초를 확인한 뒤, ‘다시 듣기’ 옆 슬라이더를 그 시각으로 옮겨 보세요.'],
            [/정상|점검|측정\s*조건|비교\s*조건|판정|결함/iu,
                '같은 공정 설정과 같은 위치에서 다시 녹음해 기준음과 비교해요. 보호가스 유량과 비드 사진을 함께 기록하면, 소리가 달라졌을 때 원인을 확인하기 쉬워요.',
                '같은 작업 조건에서 녹음을 남긴 뒤, 리포트의 시간 파형과 FFT에서 변화가 되풀이되는지 살펴보세요. 작업 설정도 함께 남기면 해석할 때 비교하기 편해요.']
        ];
        return replies.filter(([match]) => match.test(topic)).slice(0, 2)
            .map(([, answer, elaboration]) => referringBack ? elaboration : answer).join('\n\n') ||
            '아크 상태, FFT 그래프, 점수, 보호가스나 스패터·험핑 확인 방법 중 궁금한 항목을 물어보세요.';
    }

    function equipmentContext(device, report) {
        const context = {};
        const fields = {
            name: device.name, model: device.model, details: device.details, point: device.point,
            reportSummary: report?.summary
        };
        for (const [key, value] of Object.entries(fields)) {
            if (typeof value === 'string' && value.trim()) context[key] = value.trim().slice(0, 600);
        }
        if (Number.isFinite(device.rpm) && device.rpm >= 0) context.rpm = device.rpm;
        const nextChecks = report?.nextChecks?.filter(step => typeof step === 'string' && step.trim())
            .slice(0, 3).map(step => step.trim().slice(0, 600));
        if (nextChecks?.length) context.nextChecks = nextChecks;
        return context;
    }

    function revealTitle(heading, title, reducedMotion) {
        const characters = Array.from(title);
        let timer;
        let index = 0;
        heading.setAttribute('aria-label', title);
        heading.title = title;

        function type() {
            if (reducedMotion.matches) {
                heading.textContent = title;
                return;
            }
            index += 1;
            heading.textContent = characters.slice(0, index).join('');
            if (index < characters.length) timer = window.setTimeout(type, 34);
        }

        if (reducedMotion.matches) type();
        else timer = window.setTimeout(type, 750);

        return () => {
            window.clearTimeout(timer);
            heading.removeAttribute('aria-label');
            heading.removeAttribute('title');
        };
    }

    function mount(root, { initialQuestion, report, device, heading } = {}) {
        const host = root.querySelector('[data-report-chat]');
        const log = host.querySelector('[data-report-chat-log]');
        const announcement = host.querySelector('[data-report-chat-announcement]');
        const form = host.querySelector('[data-report-chat-composer]');
        const input = form.querySelector('[data-report-chat-input]');
        const sheet = host.closest('.app-sheet');
        const viewport = window.visualViewport;
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const stopTitle = revealTitle(heading, conversationTitle(initialQuestion), media);
        const events = new AbortController();
        const options = { signal: events.signal };
        const messages = [];
        const matchingReport = !device || (report?.deviceId === device.id && (report?.model || '') === (device.model || '')) ? report : null;
        const welding = !device && matchingReport?.recording === 'welding-demo';
        const equipment = device ? equipmentContext(device, matchingReport) : null;
        let active = null;
        let typingFrame = 0;

        function scrollToLatest() {
            log.scrollTop = log.scrollHeight;
        }

        function fitKeyboard() {
            if (!viewport || !sheet) return;
            const visibleBottom = viewport.offsetTop + viewport.height;
            const inset = sheet.closest('.app-shell').getBoundingClientRect().bottom - visibleBottom;
            const typing = document.activeElement === input && inset > 80;
            sheet.classList.toggle('report-chat-keyboard-open', typing);
            sheet.style.setProperty('--report-chat-keyboard-inset', typing ? inset + 'px' : '0px');
            if (typing) scrollToLatest();
        }

        input.addEventListener('focus', fitKeyboard, options);
        input.addEventListener('blur', fitKeyboard, options);
        viewport?.addEventListener('resize', fitKeyboard, options);
        viewport?.addEventListener('scroll', fitKeyboard, options);

        function append(role, content) {
            log.insertAdjacentHTML('beforeend', bubble(role, content));
            scrollToLatest();
            return log.lastElementChild.querySelector('.report-chat-bubble');
        }

        function localAnswer(question) {
            return reportAnswer(question, messages, matchingReport, device, welding);
        }

        async function getAnswer(turn) {
            if (welding || equipment?.name) {
                try {
                    const payload = { messages: messages.slice(-10).map(message => ({
                        role: message.role, content: message.content.slice(0, 1000)
                    })) };
                    if (equipment) payload.equipment = equipment;
                    const response = await fetch('/api/report-chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: turn.controller.signal,
                        body: JSON.stringify(payload)
                    });
                    if (response.ok) {
                        const result = await response.json();
                        if (typeof result.answer === 'string' && result.answer.trim()) {
                            return result.answer.trim().slice(0, 2000);
                        }
                    }
                } catch {
                    // A local answer is available without a server connection.
                }
            }
            return localAnswer(turn.question);
        }

        function showAnswer(turn, content) {
            if (active !== turn) return;
            turn.thinking.remove();
            messages.push({ role: 'assistant', content });
            const output = append('assistant', '');
            function finish() {
                output.textContent = content;
                output.classList.remove('is-typing');
                announcement.textContent = content;
                active = null;
                form.removeAttribute('data-chat-busy');
                binding.refresh();
                scrollToLatest();
            }
            if (media.matches) {
                finish();
                return;
            }
            output.classList.add('is-typing');
            const letters = Array.from(content);
            const start = performance.now();
            const duration = Math.min(2350, Math.max(300, letters.length * 12));
            function type(now) {
                if (active !== turn) return;
                const progress = Math.min(1, (now - start) / duration);
                if (progress >= 1 || media.matches) {
                    finish();
                    return;
                }
                const atBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 36;
                output.textContent = letters.slice(0, Math.max(1, Math.floor(progress * letters.length))).join('');
                if (atBottom) scrollToLatest();
                typingFrame = requestAnimationFrame(type);
            }
            typingFrame = requestAnimationFrame(type);
        }

        async function submit(question) {
            if (active) return;
            const turn = { question, controller: new AbortController() };
            active = turn;
            form.setAttribute('data-chat-busy', '');
            binding.refresh();
            messages.push({ role: 'user', content: question });
            append('user', question);
            log.insertAdjacentHTML('beforeend', '<li class="report-chat-thinking" data-report-chat-thinking>' +
                '<span aria-hidden="true"><i></i><i></i><i></i></span><span>답변을 생각하고 있어요</span></li>');
            turn.thinking = log.lastElementChild;
            announcement.textContent = '답변을 생각하고 있어요.';
            scrollToLatest();

            const started = performance.now();
            const timeout = new Promise(resolve => {
                turn.timeout = window.setTimeout(() => {
                    turn.controller.abort();
                    resolve(localAnswer(question));
                }, 8000);
            });
            const response = await Promise.race([getAnswer(turn), timeout]);
            window.clearTimeout(turn.timeout);
            if (active !== turn) return;
            const remaining = Math.max(0, (media.matches ? 400 : 1500) - (performance.now() - started));
            turn.delay = window.setTimeout(() => showAnswer(turn, response), remaining);
        }

        const binding = bindComposer(form, submit);
        scrollToLatest();
        const seed = initialQuestion?.trim().slice(0, 240);
        if (seed) void submit(seed);

        return () => {
            stopTitle();
            binding.dispose();
            events.abort();
            sheet?.classList.remove('report-chat-keyboard-open');
            sheet?.style.removeProperty('--report-chat-keyboard-inset');
            cancelAnimationFrame(typingFrame);
            if (!active) return;
            const turn = active;
            active = null;
            turn.controller.abort();
            window.clearTimeout(turn.delay);
            window.clearTimeout(turn.timeout);
        };
    }

    globalThis.ReportChat = { composer, bindComposer, questions, bindQuestions, render, mount };
})();
