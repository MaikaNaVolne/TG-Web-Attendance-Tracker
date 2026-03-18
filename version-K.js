(function() {
    const ignoreList = [];

    const getIsoDate = (date) => {
        const d = date || new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const mondayStr = (() => {
        const d = new Date();
        const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return getIsoDate(new Date(d.setDate(diff)));
    })();

    const todayStr = getIsoDate(new Date());

    console.log(`🚀 Скрипт запущен. Ищем с Пн (${mondayStr}) по Сегодня (${todayStr})`);
    console.log(`👉 Листай чат МЕДЛЕННО вверх. В конце напиши stop()`);

    const peerNames = {};
    const records = {};
    const processedMids = new Set();
    let lastDate = todayStr; // По умолчанию среда

    // --- УЛЬТРА-ОЧИСТКА ИМЕНИ ---
    const cleanName = (s) => {
        if (!s || s.length > 50) return null;
      
        let n = s.split('\n')[0].replace(/был\(а\)\s+.*?(назад|недавно|только что|в сети)/i, '').trim();

        
        if (n.length > 3) {
            const first = n[0].toLowerCase();
            const last = n[n.length - 1].toLowerCase();
            
            if (first === last && !n.includes(" ")) {
                n = n.slice(0, -1);
            }
        }

      
        const words = n.split(' ');
        if (words.length >= 2) {
            const initialsInName = (words[0][0] + (words[1] ? words[1][0] : "")).toUpperCase();
            // Проверяем последние 2 буквы всей строки
            const tail2 = n.slice(-2).toUpperCase();
            if (tail2 === initialsInName && n.length > 4) {
                // Если в конце реально прилипли инициалы
                if (words[words.length-1].length <= 2) {
                    words.pop();
                    n = words.join(' ');
                } else if (words[words.length-1].toUpperCase().endsWith(initialsInName)) {
                   
                    n = n.slice(0, -2);
                }
            }
        }
        return n.trim();
    };

    const t2m = (t) => { if(!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; };
    const m2t = (m) => { return `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`; };

    const parseTgDate = (str) => {
        if (!str) return null;
        const s = str.toLowerCase();
        if (s.includes("сегодня")) return todayStr;
        if (s.includes("вчера")) {
            const d = new Date(); d.setDate(d.getDate() - 1);
            return getIsoDate(d);
        }
        const months = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
        const match = s.match(/(\d{1,2})\s+([а-я]+)/);
        if (match) {
            const mIdx = months.findIndex(m => match[2].startsWith(m));
            if (mIdx !== -1) {
                const now = new Date();
                const d = new Date(now.getFullYear(), mIdx, parseInt(match[1]));
                if (d > now) d.setFullYear(d.getFullYear() - 1);
                return getIsoDate(d);
            }
        }
        return null;
    };

    const scan = () => {
        // Собираем базу имен по Peer ID
        document.querySelectorAll('[data-peer-id]').forEach(el => {
            const id = el.getAttribute('data-peer-id');
            const raw = el.innerText || el.getAttribute('aria-label') || el.getAttribute('title');
            const name = cleanName(raw);
            if (name && name.length > 1 && isNaN(name)) {
                if (!peerNames[id] || name.length > peerNames[id].length) peerNames[id] = name;
            }
        });

        const elements = document.querySelectorAll('.bubble.service.is-date, .bubbles-group');
        elements.forEach(el => {
            if (el.classList.contains('is-date')) {
                const d = parseTgDate(el.querySelector('.i18n')?.innerText);
                if (d) lastDate = d;
                return;
            }

            if (!lastDate || lastDate < mondayStr) return;

            const avatarEl = el.querySelector('.avatar-like, .bubbles-group-avatar');
            const peerId = avatarEl?.getAttribute('data-peer-id');
            if (!peerId) return;

            const bubbles = el.querySelectorAll('.bubble[data-mid]');
            bubbles.forEach(b => {
                const mid = b.getAttribute('data-mid');
                if (processedMids.has(mid)) return;
                processedMids.add(mid);

                const timeText = b.querySelector('.time .i18n')?.innerText || "";
                let msgTime = timeText.match(/\d{2}:\d{2}/)?.[0];
                const text = b.innerText.toLowerCase();

                const manualTime = text.match(/\b([0-1]?[0-9]|2[0-3]):[0-5][0-9]\b/);
                if (manualTime) msgTime = manualTime[0];

                if (!msgTime) return;

                if (!records[peerId]) records[peerId] = { days: {} };
                if (!records[peerId].days[lastDate]) {
                    const dParts = lastDate.split('-');
                    const dObj = new Date(dParts[0], dParts[1]-1, dParts[2]);
                    records[peerId].days[lastDate] = {
                        dayName: ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][dObj.getDay()]
                    };
                }

                const day = records[peerId].days[lastDate];
                const mins = t2m(msgTime);

                const isIn = text.includes("приход") || text.includes("пришел") || text.includes("пришла") || (mins < 810 && !text.includes("ушел") && !text.includes("выход") && !text.includes("закрил") && !text.includes("смен"));
                const isOut = text.includes("уход") || text.includes("ушел") || text.includes("ушла") || text.includes("выход") || text.includes("закрил") || text.includes("смен") || mins >= 810;

                if (isIn) {
                    if (!day.in || mins < t2m(day.in)) day.in = msgTime;
                } else if (isOut) {
                    if (!day.out || mins > t2m(day.out)) {
                        day.out = msgTime;
                        day.late = mins > 1260;
                    }
                }
            });
        });
    };

    const interval = setInterval(scan, 500);

    window.stop = () => {
        clearInterval(interval);
        console.clear();
        const finalReport = [];

        Object.keys(records).forEach(peerId => {
            let name = peerNames[peerId] || `User_${peerId}`;

            if (ignoreList.some(ignored => name.toLowerCase().includes(ignored.toLowerCase()))) return;

            let totalMins = 0;
            let isOpen = false;
            const daysData = records[peerId].days;

            const details = Object.keys(daysData).sort().map(dKey => {
                if (dKey < mondayStr) return null;
                const day = daysData[dKey];
                if (day.in && day.out) {
                    let diff = t2m(day.out) - t2m(day.in);
                    if (diff < 0) diff += 1440;
                    totalMins += diff;
                } else if (day.in) isOpen = true;
                return `${day.dayName}: ${day.in || '???'}-${day.out || '???'}${day.late ? ' !' : ''}`;
            }).filter(d => d !== null);

            if (details.length > 0) {
                finalReport.push({
                    "Сотрудник": name,
                    "Итого часов": m2t(totalMins),
                                 "Статус": isOpen ? "🔴 Смена открыта" : "✅ Закрыто",
                                 "Детализация": details.join(" | ")
                });
            }
        });

        console.table(finalReport);
    };
})();
