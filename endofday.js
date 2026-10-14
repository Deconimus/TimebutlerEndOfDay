// ==UserScript==
// @name         Timebutler End of Day
// @namespace    http://tampermonkey.net/
// @version      2026-10-13
// @description  Show estimated end of day in Timebutler's dashboard.
// @author       Deconimus
// @match        https://app.timebutler.com/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=timebutler.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Custom work-time goal in minutes (e.g. 8*60 for 8hrs)
    // (will be displayed ALONGSIDE timebutler total work time)
    const CUSTOM_WORK_MINS_GOAL = -1;

    // Custom net work minutes per weekday (index = Date.getDay(): 0 = Sunday ... 6 = Saturday).
    // -1 = no custom value, use Timebutler's default target for that day.
    // (will be display INSTEAD of timebutler total worktime)
    const CUSTOM_WORK_MINS_DAYS = [-1, -1, -1, -1, -1, -1, -1];

    function parseDuration(text) {
        if (!text) return 0;
        const h = text.match(/(\d+)\s*h/i);
        const m = text.match(/(\d+)\s*m/i);
        return (h ? parseInt(h[1], 10) : 0) * 60 + (m ? parseInt(m[1], 10) : 0);
    }

    // Language-agnostic: only looks for the H:MM / H.MM pattern (optional am/pm marker).
    // Returns minutes since midnight, or null if no clock time is found.
    function parseClockMinutes(text) {
        if (!text) return null;
        const t = text.match(/(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*([ap])\.?\s*m\.?)?/i);
        if (!t) return null;
        let h = parseInt(t[1], 10);
        const m = parseInt(t[2], 10);
        if (t[3]) {
            const pm = t[3].toLowerCase() === 'p';
            h = (h % 12) + (pm ? 12 : 0);
        }
        if (h > 23 || m > 59) return null;
        return h * 60 + m;
    }

    function formatClock(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDuration(mins) {
        const sign = mins < 0 ? "-" : "";
        mins = Math.abs(Math.round(mins));
        return sign + Math.floor(mins / 60) + "h " + (mins % 60) + "m";
    }

    const work_deficit_spans = document.getElementsByClassName("dashboard-worktime-remaining deficit");
    const work_excess_spans = document.getElementsByClassName("dashboard-worktime-remaining excess");
    const pause_span = document.getElementById("zeSollIst-pausehhmm");
    const started_divs = document.getElementsByClassName("dashboard-worktime-started-info");

    if (work_deficit_spans.length === 0 && work_excess_spans.length === 0)
    {
        console.warn("Timebutler script: .dashboard-worktime-remaining deficit and excess not found");
    }
    else if (!pause_span)
    {
        console.warn("Timebutler script: #zeSollIst-pausehhmm not found");
    }
    else if (started_divs.length === 0)
    {
        console.warn("Timebutler script: .dashboard-worktime-started-info not found");
    }
    else
    {
        if (work_deficit_spans.length > 1)
        {
            console.warn("Timebutler script: multiple .dashboard-worktime-remaining deficit found, using the first");
        }
        if (work_excess_spans.length > 1)
        {
            console.warn("Timebutler script: multiple .dashboard-worktime-remaining excess found, using the first");
        }
        if (started_divs.length > 1)
        {
            console.warn("Timebutler script: multiple .dashboard-worktime-started-info found, using the first");
        }

        const work_deficit_span = work_deficit_spans.length > 0 ? work_deficit_spans[0] : null;
        const work_excess_span = work_excess_spans.length > 0 ? work_excess_spans[0] : null;
        const work_time_div = work_deficit_span ? work_deficit_span.parentElement : work_excess_span.parentElement
        const total_work_span = work_time_div ? (work_time_div.querySelectorAll("span").length > 0 ? work_time_div.querySelectorAll("span")[work_time_div.querySelectorAll("span").length - 1] : null) : null;
        const started_div = started_divs[0];

        const started_span = started_div.querySelector("span:not(#tb-end-time)");
        const startMin = started_span ? parseClockMinutes(started_span.textContent) : null;
        if (startMin === null)
        {
            console.warn("Timebutler script: could not parse start time from first span of .dashboard-worktime-started-info");
        }

        let remainingWorkMin = work_deficit_span ? parseDuration(work_deficit_span.textContent) : -parseDuration(work_excess_span.textContent);
        let totalWorkMin = total_work_span ? parseDuration(total_work_span.textContent) : null;

        const pauseMin = parseDuration(pause_span.textContent);

        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();

        // Net work done so far (elapsed time since start minus pause already taken)
        let workedSoFarMin = startMin !== null ? Math.max(0, nowMin - startMin - pauseMin) : null;

        // Pause still owed to reach 30 minutes (0 if already reached)
        let missingPauseMin = Math.max(0, 30 - pauseMin);

        // Custom work time for the current weekday overrides the default target
        const customWorkMin = CUSTOM_WORK_MINS_DAYS[now.getDay()];
        if (customWorkMin > 0)
        {
            if (workedSoFarMin === null)
            {
                console.warn("Timebutler script: custom work time set for today but start time unknown, ignoring it");
            }
            else
            {
                remainingWorkMin = customWorkMin - workedSoFarMin;
                // Short days (<= 6h) don't require the mandatory pause
                if (customWorkMin <= 6 * 60) missingPauseMin = 0;
            }
        }

        if (totalWorkMin !== null)
        {
            console.log("Timebutler script: total work length today: " + formatDuration(totalWorkMin));
        }

        const end = new Date(Date.now() + (remainingWorkMin + missingPauseMin) * 60 * 1000);
        const endCustomHrs = customWorkMin <= 0 && CUSTOM_WORK_MINS_GOAL > 0 ? new Date(Date.now() + (CUSTOM_WORK_MINS_GOAL - workedSoFarMin + missingPauseMin) * 60 * 1000) : null;

        // Reuse the span if the script runs more than once, instead of appending duplicates
        let end_span = document.getElementById("tb-end-time");
        if (!end_span)
        {
            end_span = document.createElement("span");
            end_span.id = "tb-end-time";
            end_span.style.display = "block";
            started_div.appendChild(end_span);
        }
        end_span.textContent = "🏝️ Done at " + formatClock(end) + (endCustomHrs ? " ("+ formatClock(endCustomHrs) +")" : "");
        if (totalWorkMin !== null)
        {
            end_span.title = "Total work time: " + formatDuration(totalWorkMin);
            if (customWorkMin > 0 || CUSTOM_WORK_MINS_GOAL > 0)
            {
                end_span.title += "; custom goal: " + formatDuration(customWorkMin > 0 ? customWorkMin : CUSTOM_WORK_MINS_GOAL);
            }
        }
    }
})();
