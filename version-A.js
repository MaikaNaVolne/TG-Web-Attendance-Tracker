(() => {
    console.log("🚀 Запуск парсера рабочего времени...");

    // СПИСОК ИМЕН ДЛЯ ИГНОРИРОВАНИЯ
    const ignoreList = [];

    // 1. Вспомогательные функции
    const getLastMonday = () => {
        const d = new Date();
        const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday;
    };

    const parseTgDate = (dateStr) => {
        if (!dateStr) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const lowerDate = dateStr.toLowerCase().trim();
        if (lowerDate === "сегодня") return today;
        if (lowerDate === "вчера") return yesterday;

        const days = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
        const dayIndex = days.indexOf(lowerDate);
        if (dayIndex !== -1) {
            const tempDate = new Date();
            const currentDay = tempDate.getDay();
            const distance = (currentDay + 7 - dayIndex) % 7;
            tempDate.setDate(tempDate.getDate() - distance);
            tempDate.setHours(0, 0, 0, 0);
            return tempDate;
        }

        const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
        const match = lowerDate.match(/(\d{1,2})\s+([а-я]+)/);
        if (match) {
            const day = parseInt(match[1]);
            const monthStr = match[2].substring(0, 3);
            const monthIndex = months.findIndex(m => monthStr.includes(m));
            if (monthIndex !== -1) {
                const parsedDate = new Date(today.getFullYear(), monthIndex, day);
                if (parsedDate > today) parsedDate.setFullYear(today.getFullYear() - 1);
                parsedDate.setHours(0,0,0,0);
                return parsedDate;
            }
        }
        return null;
    };

    const timeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const minutesToTime = (mins) => {
        const h = Math.floor(mins / 60).toString().padStart(2, '0');
        const m = (mins % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    };

    // 2. Инициализация
    const lastMonday = getLastMonday();
    const records = {};
    let currentDate = null;
    let currentAuthor = "Неизвестный";

    // 3. Сбор и обработка
    const elements = document.querySelectorAll('.message-list-item, .sticky-date');

    elements.forEach(el => {
        if (el.classList.contains('sticky-date') || el.querySelector('.sticky-date span')) {
            const dateSpan = el.classList.contains('sticky-date') ? el : el.querySelector('.sticky-date span');
            const parsedDate = parseTgDate(dateSpan.innerText);
            if (parsedDate) currentDate = parsedDate;
            return;
        }

        if (!currentDate || currentDate < lastMonday) return;

        const groupContainer = el.closest('.sender-group-container');
        if (groupContainer) {
            const titleEl = groupContainer.querySelector('.sender-title');
            const avatarEl = groupContainer.querySelector('.Avatar');

            if (titleEl && titleEl.innerText) {
                currentAuthor = titleEl.innerText.trim();
            } else if (avatarEl) {
                currentAuthor = avatarEl.getAttribute('aria-label')?.trim() ||
                avatarEl.querySelector('img')?.alt?.trim() ||
                currentAuthor;
            }
        }

        if (ignoreList.includes(currentAuthor)) {
            return; // Если да, пропускаем это сообщение
        }

        const timeEl = el.querySelector('.message-time');
        const textEl = el.querySelector('.text-content');
        if (!timeEl) return;

        let msgTime = timeEl.innerText.trim();
        const textContent = textEl ? textEl.innerText.toLowerCase() : "";

        const timeRegex = /\b([0-1]?[0-9]|2[0-3]):[0-5][0-9]\b/;
        const textTimeMatch = textContent.match(timeRegex);
        if (textTimeMatch) {
            msgTime = textTimeMatch[0];
        }

        const msgMinutes = timeToMinutes(msgTime);
        const dateKey = currentDate.toISOString().split('T')[0];
        const dayOfWeek = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][currentDate.getDay()];

        const isExplicitIn = textContent.includes("приход") || textContent.includes("пришел") || textContent.includes("пришла");
        const isExplicitOut = textContent.includes("уход") || textContent.includes("ушел") || textContent.includes("ушла") || textContent.includes("выход");

        let eventType = null;
        if (isExplicitIn) {
            eventType = 'in';
        } else if (isExplicitOut) {
            eventType = 'out';
        } else {
            eventType = msgMinutes < 810 ? 'in' : 'out'; // 13:30
        }

        if (!records[currentAuthor]) records[currentAuthor] = {};
        if (!records[currentAuthor][dateKey]) records[currentAuthor][dateKey] = { dayName: dayOfWeek };

        const dayRecord = records[currentAuthor][dateKey];

        if (eventType === 'in') {
            if (!dayRecord.in || msgMinutes < timeToMinutes(dayRecord.in)) {
                dayRecord.in = msgTime;
            }
        } else { // 'out'
            if (!dayRecord.out || msgMinutes > timeToMinutes(dayRecord.out)) {
                dayRecord.out = msgTime;
                if (msgMinutes > 1260) { // 21:00 = 1260 минут
                    dayRecord.lateFlag = true;
                }
            }
        }
    });

    // 4. Формирование отчета
    const finalReport = [];

    for (const [author, dates] of Object.entries(records)) {
        let totalMinutes = 0;
        let hasOpenShift = false;
        const detailsArray = [];
        const sortedDates = Object.keys(dates).sort();

        for (const date of sortedDates) {
            const data = dates[date];
            const tIn = data.in || "???";
            const tOut = data.out || "???";

            const lateMark = data.lateFlag ? " !" : "";
            detailsArray.push(`${data.dayName}: ${tIn}-${tOut}${lateMark}`);

            if (data.in && data.out) {
                let diff = timeToMinutes(data.out) - timeToMinutes(data.in);
                if (diff < 0) diff += 24 * 60;
                totalMinutes += diff;
            } else if (data.in && !data.out) {
                hasOpenShift = true;
            }
        }

        finalReport.push({
            "Сотрудник": author,
            "Итого часов": minutesToTime(totalMinutes),
                         "Статус": hasOpenShift ? "🔴 Смена открыта" : "✅ Закрыто",
                         "Детализация": detailsArray.join(" | ")
        });
    }

    if (finalReport.length === 0) {
        console.warn("Нет данных для вывода. Убедитесь, что проскроллили чат и что в списке для игнорирования нет всех сотрудников.");
    } else {
        console.table(finalReport);
    }

})();
