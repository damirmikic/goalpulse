// API Configuration
const API_URL = 'https://sports-api.cloudbet.com/pub/v2/odds/events?sport=soccer&live=false&markets=soccer.match_odds&markets=soccer.total_goals&markets=soccer.both_teams_to_score&markets=soccer.total_goals_period_first_half&players=false&limit=2000';
const API_KEY = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkhKcDkyNnF3ZXBjNnF3LU9rMk4zV05pXzBrRFd6cEdwTzAxNlRJUjdRWDAiLCJ0eXAiOiJKV1QifQ.eyJhY2Nlc3NfdGllciI6InRyYWRpbmciLCJleHAiOjIwNjE1Mzc1MDIsImlhdCI6MTc0NjE3NzUwMiwianRpIjoiNTU1ODk0NjgtZjJhZi00ZGQ3LWE3MTQtZjNiNjgyMWU4OGRkIiwic3ViIjoiOGYwYTk5YTEtNTFhZi00YzJlLWFlNDUtY2MxNjgwNDVjZTc3IiwidGVuYW50IjoiY2xvdWRiZXQiLCJ1dWlkIjoiOGYwYTk5YTEtNTFhZi00YzJlLWFlNDUtY2MxNjgwNDVjZTc3In0.BW_nXSwTkxTI7C-1UzgxWLnNzo9Bo1Ed8hI9RfVLnrJa6sfsMyvQ1NrtT5t6i_emwhkRHU1hY-9i6c2c5AI4fc2mRLSNBujvrfbVHX67uB58E8TeSOZUBRi0eqfLBL7sYl1JNPZzhFkDBCBNFJZJpn40FIjIrtIiPd-G5ClaaSMRWrFUDiwA1NmyxHSfkfRpeRSnfk15qck7zSIeNeITzPbD7kZGDIeStmcHuiHfcQX3NaHaI0gyw60wmDgan83NpYQYRVLQ9C4icbNhel4n5H5FGFAxQS8IcvynqV8f-vz2t4BRGuYXBU8uhdYKgezhyQrSvX6NpwNPBJC8CWo2fA';

// DOM Elements
const appContainer = document.getElementById('appContainer');
const competitionsDropdown = document.getElementById('competitionsDropdown');
const eventsListDiv = document.getElementById('eventsList'); 

const selectedEventNameElem = document.getElementById('selectedEventName');
const selectedEventTimeElem = document.getElementById('selectedEventTime');

const modeToggleContainer = document.getElementById('modeToggleContainer');
const manualModeToggle = document.getElementById('manualModeToggle');
const manualInputTypeSelector = document.getElementById('manualInputTypeSelector');
const supremacyExpectancyInputsDiv = document.getElementById('supremacyExpectancyInputs');
const manualSupremacyInput = document.getElementById('manualSupremacy');
const manualExpectancyInput = document.getElementById('manualExpectancy');
const desiredMarginInputContainer = document.getElementById('desiredMarginInputContainer');
const desiredMarginInput = document.getElementById('desiredMargin');


const marketOddsInfoElem = document.getElementById('marketOddsInfo'); 
const bttsInfoElem = document.getElementById('bttsInfo'); 
const totalGoalsInfoElem = document.getElementById('totalGoalsInfo'); 
const firstHalfTotalGoalsInfoElem = document.getElementById('firstHalfTotalGoalsInfo'); 
const expectedGoalsInfoElem = document.getElementById('expectedGoalsInfo'); 
const oddsChangesDisplay = document.getElementById('oddsChangesDisplay');
const percentageChangeThresholdInput = document.getElementById('percentageChangeThreshold'); 

const loader = document.getElementById('loader');
const errorMessageElem = document.getElementById('errorMessage');
const refreshStatusElem = document.getElementById('refreshStatus');

let allEventsData = []; 
let manualModeEvents = {}; 
let currentEventKeyForManualMode = null; 
let selectedEventKeyGlobal = null; 
let currentManualInputType = 'odds'; 
let previousEventMarketOdds = {}; 
let oddsChangesLog = []; 
const MAX_CHANGES_DISPLAYED = 50; 

const PRESELECTED_COMPETITION_KEY = "soccer-germany-dfb-pokal";
const MAX_GOAL_ITERATIONS = 200; 
const GOAL_LINE_CONSTANT = 2.5; 
const FH_XG_RATIO = 0.50; 
const REFRESH_INTERVAL_MS = 30000;
let refreshIntervalId = null;
let isFirstLoad = true;

// localStorage Keys
const LS_MIN_CHANGE_THRESHOLD = 'goalPulse_minChangeThreshold';
const LS_DESIRED_MARGIN = 'goalPulse_desiredMargin';
const LS_LAST_COMPETITION_KEY = 'goalPulse_lastCompetitionKey';

// Value Bet Highlighter Threshold
const VALUE_BET_THRESHOLD_PERCENT = 5; // Highlight if user's price is 5% or more higher than feed price


// --- Helper Function Definitions ---
function factorial(n) {
    if (n < 0) return NaN; 
    if (n > 170) return Infinity; 
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
}

function poissonPmf(k, lambda) {
    if (lambda < 0 || k < 0) return 0;
    const effectiveLambda = Math.min(lambda, 700); 
    if (effectiveLambda < 1e-9 && k > 5) return 0; 

    const factK = factorial(k);
    if (factK === Infinity && k > 0) return 0; 

     if (effectiveLambda > 50 && k > 50) { 
         try {
            const logPmf = k * Math.log(effectiveLambda) - effectiveLambda - Math.log(factK);
            if (logPmf < -700) return 0; 
            return Math.exp(logPmf);
        } catch (e) {
            console.warn(`Log PMF calculation issue for k=${k}, lambda=${lambda}`);
            return 0; 
        }
    }
    
    return (Math.pow(effectiveLambda, k) * Math.exp(-effectiveLambda)) / factK;
}

function calculateHomeAndUnderProbs(homeExpectedGoals, awayExpectedGoals, goalLine) { 
    let homeWinProbSum = 0, awayWinProbSum = 0, underProbSum = 0, overProbSum = 0;
    const maxScore = 20;
    for (let i = 0; i <= maxScore; i++) {
        for (let j = 0; j <= maxScore; j++) {
            const jointProb = poissonPmf(i, homeExpectedGoals) * poissonPmf(j, awayExpectedGoals);
            if (isNaN(jointProb) || jointProb === 0) continue;
            if (i > j) homeWinProbSum += jointProb;
            else if (j > i) awayWinProbSum += jointProb;
            if ((i + j) < goalLine) underProbSum += jointProb;
            else if ((i + j) > goalLine) overProbSum += jointProb;
        }
    }
    const totalWinProb = homeWinProbSum + awayWinProbSum;
    const totalUnderOverProb = underProbSum + overProbSum;
    return { 
        homeProb: totalWinProb > 0 ? homeWinProbSum / totalWinProb : 0, 
        underProb: totalUnderOverProb > 0 ? underProbSum / totalUnderOverProb : 0 
    };
}

function calculateFairProbsFromLambdas(lambdaHomeFT, lambdaAwayFT) {
    let probHome = 0, probDraw = 0, probAway = 0;
    let probUnder25 = 0;
    let probBttsYes = 0;
    
    const probHome0FT = poissonPmf(0, lambdaHomeFT);
    const probAway0FT = poissonPmf(0, lambdaAwayFT);
    probBttsYes = 1 - probHome0FT - probAway0FT + (probHome0FT * probAway0FT);

    const maxScore = 20;
    for (let i = 0; i <= maxScore; i++) { 
        for (let j = 0; j <= maxScore; j++) { 
            const jointProb = poissonPmf(i, lambdaHomeFT) * poissonPmf(j, lambdaAwayFT);
            if (isNaN(jointProb) || jointProb === 0) continue;

            if (i > j) probHome += jointProb;
            else if (j > i) probAway += jointProb;
            else probDraw += jointProb;

            if (i + j < GOAL_LINE_CONSTANT) probUnder25 += jointProb;
        }
    }
    const totalMatchProb = probHome + probDraw + probAway; 
     if (totalMatchProb > 0 && Math.abs(1 - totalMatchProb) > 1e-5) { 
        probHome /= totalMatchProb;
        probDraw /= totalMatchProb;
        probAway /= totalMatchProb;
    }
    const probOver25 = 1 - probUnder25; 

    const lambdaHomeFH = lambdaHomeFT * FH_XG_RATIO;
    const lambdaAwayFH = lambdaAwayFT * FH_XG_RATIO;
    
    const probFH_0_0 = poissonPmf(0, lambdaHomeFH) * poissonPmf(0, lambdaAwayFH);
    const probUnder05FH = probFH_0_0;
    const probOver05FH = 1 - probUnder05FH;

    let probUnder15FH = probFH_0_0; 
    probUnder15FH += poissonPmf(1, lambdaHomeFH) * poissonPmf(0, lambdaAwayFH); 
    probUnder15FH += poissonPmf(0, lambdaHomeFH) * poissonPmf(1, lambdaAwayFH); 
    const probOver15FH = 1 - probUnder15FH;


    return {
        home: probHome, draw: probDraw, away: probAway,
        over25: probOver25, under25: probUnder25,
        bttsYes: probBttsYes, bttsNo: 1 - probBttsYes,
        over05FH: probOver05FH, under05FH: probUnder05FH,
        over15FH: probOver15FH, under15FH: probUnder15FH
    };
}

function applyMarginToFairProbs(fairProbs, desiredMarginDecimal) {
    const odds = {};
    const outcomes = ['home', 'draw', 'away', 'over25', 'under25', 'bttsYes', 'bttsNo', 'over05FH', 'under05FH', 'over15FH', 'under15FH'];
    outcomes.forEach(outcome => {
        if (fairProbs[outcome] != null && fairProbs[outcome] > 0) {
            odds[outcome] = ((1 - desiredMarginDecimal) / fairProbs[outcome]).toFixed(3);
        } else {
            odds[outcome] = "N/A"; 
        }
    });
    return odds;
}

function calculateExpectedGoalsFromPrices(overPrice, underPrice, homeWinPrice, awayWinPrice) {
    if (!overPrice || !underPrice || !homeWinPrice || !awayWinPrice || 
        [overPrice, underPrice, homeWinPrice, awayWinPrice].some(p => p <= 0 || isNaN(parseFloat(p)) )) {
        console.warn("Invalid or missing prices for EG calc:", {overPrice, underPrice, homeWinPrice, awayWinPrice}); 
        return null;
    }
    let totalGoals = 2.5, supremacy = 0;
    const incrementStep = 0.05, smallPositiveEG = 0.01;
    const normalisedUnderTarget = (1/underPrice) / ((1/overPrice) + (1/underPrice));
    const normalisedHomeTarget = (1/homeWinPrice) / ((1/awayWinPrice) + (1/homeWinPrice));

    if (isNaN(normalisedUnderTarget) || isNaN(normalisedHomeTarget)) {
         console.warn("Could not calculate target probs from prices."); return null;
    }
    let currentHomeEG, currentAwayEG, output, incrementTotal, error, previousError;

    output = calculateHomeAndUnderProbs(Math.max(smallPositiveEG, totalGoals/2 + supremacy/2), Math.max(smallPositiveEG, totalGoals/2 - supremacy/2), GOAL_LINE_CONSTANT);
    if (isNaN(output.underProb)) { console.warn("Initial underProb NaN"); return null; }
    
    incrementTotal = (output.underProb > normalisedUnderTarget) ? incrementStep : -incrementStep; 
    
    error = Math.abs(output.underProb - normalisedUnderTarget);
    previousError = error + 1; 

    for (let iter = 0; iter < MAX_GOAL_ITERATIONS; iter++) {
        if (error >= previousError && iter > 0) { totalGoals -= incrementTotal; break; } 
        previousError = error;
        totalGoals += incrementTotal;
        currentHomeEG = Math.max(smallPositiveEG, totalGoals/2 + supremacy/2);
        currentAwayEG = Math.max(smallPositiveEG, totalGoals/2 - supremacy/2);
        if (totalGoals < smallPositiveEG * 2 || currentHomeEG <=0 || currentAwayEG <=0 ) { totalGoals -= incrementTotal; break; }
        output = calculateHomeAndUnderProbs(currentHomeEG, currentAwayEG, GOAL_LINE_CONSTANT);
        if (isNaN(output.underProb)) { totalGoals -= incrementTotal; break; }
        error = Math.abs(output.underProb - normalisedUnderTarget);
    }
    
    output = calculateHomeAndUnderProbs(Math.max(smallPositiveEG, totalGoals/2 + supremacy/2), Math.max(smallPositiveEG, totalGoals/2 - supremacy/2), GOAL_LINE_CONSTANT);
    if (isNaN(output.homeProb)) { console.warn("Initial homeProb for supremacy NaN"); return null; }
    let incrementSup = (output.homeProb > normalisedHomeTarget) ? -incrementStep : incrementStep;
    error = Math.abs(output.homeProb - normalisedHomeTarget);
    previousError = error + 1; 

    for (let iter = 0; iter < MAX_GOAL_ITERATIONS; iter++) {
        if (error >= previousError && iter > 0) { supremacy -= incrementSup; break; } 
        previousError = error;
        supremacy += incrementSup;
        currentHomeEG = Math.max(smallPositiveEG, totalGoals/2 + supremacy/2);
        currentAwayEG = Math.max(smallPositiveEG, totalGoals/2 - supremacy/2);
        if (currentHomeEG <= 0 || currentAwayEG <= 0) { supremacy -= incrementSup; break; }
        output = calculateHomeAndUnderProbs(currentHomeEG, currentAwayEG, GOAL_LINE_CONSTANT);
        if (isNaN(output.homeProb)) { supremacy -= incrementSup; break; }
        error = Math.abs(output.homeProb - normalisedHomeTarget);
    }
    const finalLambdaHome = Math.max(smallPositiveEG, totalGoals/2 + supremacy/2);
    const finalLambdaAway = Math.max(smallPositiveEG, totalGoals/2 - supremacy/2);
    if (finalLambdaHome <= 0 || finalLambdaAway <=0 || finalLambdaHome > 15 || finalLambdaAway > 15) {
        console.warn("Calculated lambdas out of range:", finalLambdaHome, finalLambdaAway);
    }
    return { lambdaHome: finalLambdaHome, lambdaAway: finalLambdaAway, totalExpectedGoals: finalLambdaHome + finalLambdaAway, supremacy: finalLambdaHome - finalLambdaAway };
}

// --- Main Application Logic & DOM Manipulation ---

function formatCompetitionDisplayText(key) {
    let displayName = key;
    if (displayName.startsWith("soccer-")) displayName = displayName.substring(7);
    displayName = displayName.replace(/-/g, " ");
    return displayName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function trackAndLogOddsChanges(currentEventsData) {
    const newChanges = [];
    let userDefinedMinPercentageChange = 0;
    if (percentageChangeThresholdInput) {
        userDefinedMinPercentageChange = parseFloat(percentageChangeThresholdInput.value);
        if (isNaN(userDefinedMinPercentageChange) || userDefinedMinPercentageChange < 0) {
            userDefinedMinPercentageChange = 0; 
        }
    }

    currentEventsData.forEach(competition => {
        competition.events.forEach(event => {
            if (manualModeEvents[event.key]) return; 

            const prevEventOddsForCurrentEvent = previousEventMarketOdds[event.key] || {};
            const currentEventOdds = {};
            let eventNameForLog = event.name;

            const processMarket = (marketName, marketKey, submarketKey, outcomes, outcomePrefix, params = null) => {
                const selections = event.markets?.[marketKey]?.submarkets?.[submarketKey]?.selections;
                if (selections) {
                    outcomes.forEach(o_val => { 
                        const selection = params ? 
                                          selections.find(s => s.outcome === o_val && s.params === params) :
                                          selections.find(s => s.outcome === o_val);
                        const currentPriceFromAPI = selection?.price; 
                        const key = `${outcomePrefix}_${params ? params.replace("total=","") + "_" : ""}${o_val}`; 

                        if (currentPriceFromAPI != null) currentEventOdds[key] = currentPriceFromAPI;
                        
                        const oldPriceNum = prevEventOddsForCurrentEvent[key]; 

                        if (oldPriceNum != null && currentPriceFromAPI != null) {
                            if (!isNaN(oldPriceNum) && !isNaN(currentPriceFromAPI)) { 
                                let meetsThreshold = false;
                                let percentageDifferenceCalc = 0;

                                if (oldPriceNum.toFixed(3) === currentPriceFromAPI.toFixed(3)) {
                                    meetsThreshold = false;
                                } else if (oldPriceNum === 0) { 
                                    percentageDifferenceCalc = Infinity;
                                    meetsThreshold = true; 
                                } else {
                                    percentageDifferenceCalc = Math.abs((currentPriceFromAPI - oldPriceNum) / oldPriceNum) * 100;
                                    if (percentageDifferenceCalc >= userDefinedMinPercentageChange) {
                                        meetsThreshold = true;
                                    }
                                }

                                if (meetsThreshold) {
                                    newChanges.push({ 
                                        timestamp: new Date(), 
                                        eventName: eventNameForLog, 
                                        market: marketName + (params ? ` ${params.replace("total=","")}` : ""), 
                                        outcome: o_val.charAt(0).toUpperCase() + o_val.slice(1), 
                                        oldPrice: oldPriceNum, 
                                        newPrice: currentPriceFromAPI,
                                        percentageChange: percentageDifferenceCalc 
                                    });
                                }
                            }
                        }
                    });
                }
            };

            processMarket("Match Odds", "soccer.match_odds", "period=ft", ['home', 'draw', 'away'], "mo");
            processMarket("BTTS", "soccer.both_teams_to_score", "period=ft", ['yes', 'no'], "btts");
            processMarket("Total Goals", "soccer.total_goals", "period=ft", ['over', 'under'], "tg", "total=2.5");
            
            const fhTgMarket = event.markets?.['soccer.total_goals_period_first_half']?.submarkets;
            let fhLine = null, fhKeyPrefix = null, fhSelectionsForTracking = null, fhSubmarketKey = null;

            if (fhTgMarket) {
                if (fhTgMarket['period=fh;total=1.5'] || fhTgMarket['period=1h;total=1.5']) {
                    fhSubmarketKey = fhTgMarket['period=fh;total=1.5'] ? 'period=fh;total=1.5' : 'period=1h;total=1.5';
                    fhSelectionsForTracking = fhTgMarket[fhSubmarketKey]?.selections;
                    fhLine = 1.5; fhKeyPrefix = 'fh_tg_1.5';
                } else if (fhTgMarket['period=fh;total=0.5'] || fhTgMarket['period=1h;total=0.5']) {
                    fhSubmarketKey = fhTgMarket['period=fh;total=0.5'] ? 'period=fh;total=0.5' : 'period=1h;total=0.5';
                    fhSelectionsForTracking = fhTgMarket[fhSubmarketKey]?.selections;
                    fhLine = 0.5; fhKeyPrefix = 'fh_tg_0.5';
                }
            }
            if(fhSelectionsForTracking && fhLine != null && fhSubmarketKey){
                 processMarket(`1H Total ${fhLine}`, "soccer.total_goals_period_first_half", fhSubmarketKey, ['over', 'under'], fhKeyPrefix, `total=${fhLine}`);
            }

            if(Object.keys(currentEventOdds).length > 0) previousEventMarketOdds[event.key] = currentEventOdds;
        });
    });

    if (newChanges.length > 0) {
        oddsChangesLog = [...newChanges, ...oddsChangesLog].slice(0, MAX_CHANGES_DISPLAYED);
        renderOddsChangesLog();
    }
}


function renderOddsChangesLog() {
    if (oddsChangesLog.length === 0) {
        oddsChangesDisplay.innerHTML = '<p class="text-xs text-gray-500">No odds changes recorded yet.</p>';
        return;
    }
    let listHtml = '<ul>';
    oddsChangesLog.forEach(change => {
        let priceChangeString = `${change.oldPrice.toFixed(3)} -> ${change.newPrice.toFixed(3)}`;
        if (change.percentageChange != null) {
            if (isFinite(change.percentageChange) && change.percentageChange > 0.001) { 
                priceChangeString += ` (${change.percentageChange.toFixed(1)}%)`;
            } else if (change.percentageChange === Infinity) {
                priceChangeString += ` (significant % change)`;
            }
        }
        listHtml += `
            <li>
                <span class="odds-change-time">${change.timestamp.toLocaleTimeString()}</span>
                <span class="odds-change-detail"><strong>${change.eventName}</strong></span>
                <span class="odds-change-detail">${change.market} - ${change.outcome}: ${priceChangeString}</span>
            </li>`;
    });
    listHtml += '</ul>';
    oddsChangesDisplay.innerHTML = listHtml;
}


async function fetchData(isTriggeredByToggle = false) { 
    if (!isFirstLoad && !isTriggeredByToggle) { 
        loader.style.display = 'block'; 
        refreshStatusElem.textContent = 'Refreshing data...';
        refreshStatusElem.classList.remove('hidden');
    }
    const previouslySelectedCompetition = competitionsDropdown.value; 

    const tempPreviousOdds = {};
    if (allEventsData && allEventsData.length > 0) {
        allEventsData.forEach(comp => {
            comp.events.forEach(event => {
                if(manualModeEvents[event.key]) return; 
                
                const eventOdds = {};
                const moSelections = event.markets?.['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
                if (moSelections) moSelections.forEach(s => eventOdds[`mo_${s.outcome}`] = s.price);
                
                const bttsSelections = event.markets?.['soccer.both_teams_to_score']?.submarkets?.['period=ft']?.selections;
                if (bttsSelections) bttsSelections.forEach(s => eventOdds[`btts_${s.outcome}`] = s.price);

                const tgSelections = event.markets?.['soccer.total_goals']?.submarkets?.['period=ft']?.selections;
                 if (tgSelections) {
                    tgSelections.filter(s => s.params === "total=2.5").forEach(s => eventOdds[`tg_2.5_${s.outcome}`] = s.price);
                }
                const fhTgMarket = event.markets?.['soccer.total_goals_period_first_half']?.submarkets;
                if (fhTgMarket) {
                    let fhLine = null, fhKeyPrefix = null, fhSels = null, fhSubmarketKey = null;
                    if (fhTgMarket['period=fh;total=1.5'] || fhTgMarket['period=1h;total=1.5']) {
                        fhSubmarketKey = fhTgMarket['period=fh;total=1.5'] ? 'period=fh;total=1.5' : 'period=1h;total=1.5';
                        fhSels = fhTgMarket[fhSubmarketKey]?.selections;
                        fhLine = 1.5; fhKeyPrefix = 'fh_tg_1.5';
                    } else if (fhTgMarket['period=fh;total=0.5'] || fhTgMarket['period=1h;total=0.5']) {
                         fhSubmarketKey = fhTgMarket['period=fh;total=0.5'] ? 'period=fh;total=0.5' : 'period=1h;total=0.5';
                        fhSels = fhTgMarket[fhSubmarketKey]?.selections;
                        fhLine = 0.5; fhKeyPrefix = 'fh_tg_0.5';
                    }
                    if(fhSels) fhSels.forEach(s => eventOdds[`${fhKeyPrefix}_${s.outcome}`] = s.price);
                }
                if(Object.keys(eventOdds).length > 0) tempPreviousOdds[event.key] = eventOdds;
            });
        });
    }
    previousEventMarketOdds = JSON.parse(JSON.stringify(tempPreviousOdds));


    const fromParam = Math.floor(Date.now() / 1000); 
    const toParam = fromParam + (60 * 60 * 24 * 7); 
    const dynamicApiUrl = `${API_URL}&from=${fromParam}&to=${toParam}`;

    try {
        const response = await fetch(dynamicApiUrl, {
            method: 'GET',
            headers: { 'accept': 'application/json', 'X-API-Key': API_KEY }
        });
        
        if (!response.ok) {
            let errorBodyMessage = `API request failed with status ${response.status}.`;
            try { const errorData = await response.json(); if (errorData?.error?.message) errorBodyMessage += ` Message: ${errorData.error.message}`; else if (errorData?.message) errorBodyMessage += ` Message: ${errorData.message}`; else if (Object.keys(errorData).length > 0) errorBodyMessage += ` Details: ${JSON.stringify(errorData)}`; else errorBodyMessage += ' No further details.'; } catch (e) { try { const text = await response.text(); if(text) errorBodyMessage += ` Body: ${text.substring(0,100)}`;} catch(e_txt){} }
            throw new Error(errorBodyMessage);
        }

        const newData = await response.json();
        const newAllEventsData = newData.competitions || []; 
        
        trackAndLogOddsChanges(newAllEventsData); 
        allEventsData = newAllEventsData; 
        
        if (!isTriggeredByToggle || isFirstLoad) {
            populateCompetitionsDropdown();
            const savedCompetitionKey = localStorage.getItem(LS_LAST_COMPETITION_KEY);

            if (savedCompetitionKey && competitionsDropdown.querySelector(`option[value="${savedCompetitionKey}"]`)) {
                competitionsDropdown.value = savedCompetitionKey;
            } else if (previouslySelectedCompetition && competitionsDropdown.querySelector(`option[value="${previouslySelectedCompetition}"]`)) { 
                competitionsDropdown.value = previouslySelectedCompetition;
            } else if (allEventsData.length > 0 && PRESELECTED_COMPETITION_KEY && competitionsDropdown.querySelector(`option[value="${PRESELECTED_COMPETITION_KEY}"]`)) {
                competitionsDropdown.value = PRESELECTED_COMPETITION_KEY;
            } else if (allEventsData.length > 0 && competitionsDropdown.options.length > 1) {
                competitionsDropdown.selectedIndex = 1; 
            }
            if (isFirstLoad && competitionsDropdown.value) {
                localStorage.setItem(LS_LAST_COMPETITION_KEY, competitionsDropdown.value);
            }

            const currentCompetitionKey = competitionsDropdown.value;
            populateEventsList(currentCompetitionKey); 
            
            if (selectedEventKeyGlobal && document.querySelector(`.event-item[data-event-key="${selectedEventKeyGlobal}"]`)) {
                // Event still exists
            } else if (eventsListDiv.firstChild && eventsListDiv.querySelector('.event-item')) { 
                selectedEventKeyGlobal = eventsListDiv.querySelector('.event-item').dataset.eventKey;
            } else {
                selectedEventKeyGlobal = null; 
            }
        }
        
        displaySelectedInfo(competitionsDropdown.value, selectedEventKeyGlobal); 

        if (allEventsData.length === 0 && isFirstLoad) {
            displayError("No competitions found on initial load.");
        } else if (allEventsData.length === 0 && !isFirstLoad && !isTriggeredByToggle) {
             refreshStatusElem.textContent = 'No competitions found in refresh.';
        }
        if (isFirstLoad) appContainer.classList.remove('hidden'); 
    } catch (error) { 
        let displayMessage;
         if (error instanceof Error && error.message && typeof error.message === 'string') {
            if (error.message.toLowerCase().includes("failed to fetch")) {
                displayMessage = "Failed to fetch data. Please check your network connection and if the API endpoint is accessible. Details: " + error.message;
            } else {
                displayMessage = error.message;
            }
        } else if (typeof error === 'string' && error.trim() !== '') {
            displayMessage = error;
        } else if (error && typeof error === 'object' && Object.keys(error).length > 0) {
            if (error.message && typeof error.message === 'string') {
                displayMessage = error.message;
            } else if (error.error && error.error.message && typeof error.error.message === 'string') {
                displayMessage = error.error.message;
            } else {
                try { displayMessage = `Non-standard error object: ${JSON.stringify(error)}`; } 
                catch (e_stringify) { displayMessage = "An unstringifiable non-standard error object occurred."; }
            }
        } else if (error) { 
             try { displayMessage = `Unexpected error type: ${JSON.stringify(error)}`; } 
             catch (e_stringify) { displayMessage = "An unstringifiable unexpected error type occurred."; }
        } else {
            displayMessage = "An unknown error occurred during data fetch.";
        }
        
        console.error('Original error object caught during fetch:', error); 
        console.error('Processed error message for display:', displayMessage);

        if (isFirstLoad) {
            displayError(`Failed to load initial data. ${displayMessage}. Auto-refresh will be attempted.`);
        } else if (!isTriggeredByToggle) { 
            refreshStatusElem.textContent = `Error refreshing data. ${displayMessage}. Will retry.`;
            refreshStatusElem.classList.remove('hidden');
        }
    } finally {
        if (!isTriggeredByToggle || isFirstLoad) loader.style.display = 'none'; 
        if (!isFirstLoad && !isTriggeredByToggle) setTimeout(() => refreshStatusElem.classList.add('hidden'), 3000);
        isFirstLoad = false;
    }
}

function displayError(message) {
    let finalMessage = message;
    if (typeof message === 'string' && message.toLowerCase().includes("failed to fetch")) {
         finalMessage += "\n\n(Note: 'Failed to fetch' errors can be due to network issues, the API server being temporarily unavailable, or Cross-Origin Resource Sharing (CORS) restrictions if running this code in a browser directly trying to access an external API.)";
    }
    errorMessageElem.textContent = finalMessage;
    errorMessageElem.classList.remove('hidden');
    loader.style.display = 'none';
}

function populateCompetitionsDropdown() {
    competitionsDropdown.innerHTML = '<option value="">-- Choose competition --</option>'; 
    if (!allEventsData || allEventsData.length === 0) return;
    allEventsData.forEach(comp => {
        if (comp && comp.key && comp.name) {
            const opt = document.createElement('option');
            opt.value = comp.key;
            opt.textContent = formatCompetitionDisplayText(comp.key); 
            competitionsDropdown.appendChild(opt);
        }
    });
}

function populateEventsList(competitionKey) { 
    eventsListDiv.innerHTML = ''; 
    if (!competitionKey) return;

    const selectedCompetition = allEventsData.find(comp => comp.key === competitionKey);
    if (selectedCompetition && selectedCompetition.events && selectedCompetition.events.length > 0) {
        selectedCompetition.events.forEach(event => {
             if (event && event.key && event.name) {
                const item = document.createElement('div');
                item.classList.add('event-item');
                item.dataset.eventKey = event.key;
                item.innerHTML = `
                    <span class="truncate">${event.name}</span>
                    <input type="checkbox" class="event-checkbox sr-only"> `;
                item.addEventListener('click', () => {
                    selectedEventKeyGlobal = event.key;
                    currentManualInputType = 'odds';
                    if(document.querySelector('input[name="manualInputType"][value="odds"]')) {
                        document.querySelector('input[name="manualInputType"][value="odds"]').checked = true;
                    }
                    displaySelectedInfo(competitionKey, event.key);
                });
                eventsListDiv.appendChild(item);
            }
        });
    } else {
        eventsListDiv.innerHTML = '<p class="text-xs text-gray-500 p-2">No events found for this competition.</p>';
    }
    if(selectedEventKeyGlobal) { 
        const currentSelectedItem = eventsListDiv.querySelector(`.event-item[data-event-key="${selectedEventKeyGlobal}"]`);
        if(currentSelectedItem) currentSelectedItem.classList.add('selected');
    }
}

function updateExpectedGoalsDisplay(eventKey, homeXG, awayXG, totalXG, supremacy) {
    let egHtml = ''; 
    if (homeXG != null && awayXG != null && totalXG != null && supremacy != null) {
         egHtml += `<ul class="list-none space-y-1">
                       <li><strong>Home xG:</strong> ${homeXG.toFixed(2)}</li>
                       <li><strong>Away xG:</strong> ${awayXG.toFixed(2)}</li>
                       <li><strong>Total xG (Expectancy):</strong> ${totalXG.toFixed(2)}</li>
                       <li><strong>Supremacy:</strong> ${supremacy.toFixed(2)}</li>
                   </ul>`;
    } else {
        egHtml += '<p class="text-xs text-gray-500">Missing data for xG calculation.</p>';
    }
    expectedGoalsInfoElem.innerHTML = egHtml;
}

function createOddsSelectionHTML(outcomeName, feedPrice, feedMaxStake, feedProbability, eventKey, marketType, outcomeType, isEventInManualMode, currentManualEditType, manualEventData) {
    let displayPriceForInput;
    let detailsHtml;
    const isOddsInputDisabled = isEventInManualMode && (currentManualEditType === 'supremacy' || currentManualEditType === 'semi_auto');
    let prominentImpliedProbDisplay = 'N/A';
    let valueHighlightClass = ''; // For value bet highlighter

    if (isEventInManualMode) {
        let manualEffectivePrice; // This is the user's price
        if (currentManualEditType === 'supremacy' || currentManualEditType === 'semi_auto') {
            manualEffectivePrice = parseFloat(manualEventData?.impliedOdds?.[outcomeType] || feedPrice || 1.001);
        } else { // 'odds' edit mode
            manualEffectivePrice = parseFloat(manualEventData?.[outcomeType] || feedPrice || 1.001);
        }
        displayPriceForInput = manualEffectivePrice;

        const feedPriceNum = parseFloat(feedPrice);
        let percentageDifferenceText = 'N/A'; // Diff between manual price and feed price

        if (!isNaN(manualEffectivePrice) && !isNaN(feedPriceNum) && feedPriceNum !== 0) {
            const percentageDifference = ((manualEffectivePrice - feedPriceNum) / feedPriceNum) * 100;
            percentageDifferenceText = percentageDifference.toFixed(2) + '%';

            // Check for value bet against feed price
            if (manualEffectivePrice > feedPriceNum && percentageDifference >= VALUE_BET_THRESHOLD_PERCENT) {
                valueHighlightClass = 'value-bet-highlight';
            }
        }
        
        const manualImpliedProbValue = !isNaN(manualEffectivePrice) && manualEffectivePrice > 0 ? (1 / manualEffectivePrice) * 100 : NaN;
        let manualProbSourceNote = '';
        if (currentManualEditType === 'supremacy') manualProbSourceNote = '(from xG)';
        else if (currentManualInputType === 'semi_auto') manualProbSourceNote = '(semi-auto)';
        
        prominentImpliedProbDisplay = !isNaN(manualImpliedProbValue) ? `${manualImpliedProbValue.toFixed(1)}% <span class="text-xs">${manualProbSourceNote}</span>` : 'N/A';

        detailsHtml = `Feed Odd: ${feedPrice != null ? parseFloat(feedPrice).toFixed(3) : 'N/A'}<br>
                       Diff: ${percentageDifferenceText}`;
        
        return `
            <div class="odds-selection manual-odds-input-container ${valueHighlightClass}">
                <div class="odds-outcome">${outcomeName}</div>
                <input type="number" class="manual-odds-input" step="0.001" value="${parseFloat(displayPriceForInput || 1.001).toFixed(3)}" 
                       data-event-key="${eventKey}" data-market-type="${marketType}" data-outcome-type="${outcomeType}" ${isOddsInputDisabled ? 'disabled' : ''}>
                <div class="implied-probability">${prominentImpliedProbDisplay}</div>
                <div class="odds-details">${detailsHtml}</div>
            </div>`;

    } else { // Non-Manual Mode
        displayPriceForInput = feedPrice;
        valueHighlightClass = ''; // No value highlighting in non-manual mode against itself

        if (feedProbability != null) { 
            prominentImpliedProbDisplay = `${(feedProbability * 100).toFixed(1)}%`;
        } else if (feedPrice != null && parseFloat(feedPrice) > 0) { 
            const calculatedProb = (1 / parseFloat(feedPrice)) * 100;
            prominentImpliedProbDisplay = `${calculatedProb.toFixed(1)}%`;
        }
        
        let detailsProbText = ''; 
        if (feedProbability != null) {
             detailsProbText = `API Prob: ${(feedProbability * 100).toFixed(1)}%`;
        }

        detailsHtml = `Max Stake: ${feedMaxStake != null ? feedMaxStake.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A'}`;
        if (detailsProbText) detailsHtml += `<br>${detailsProbText}`;

        return `
            <div class="odds-selection ${valueHighlightClass}">
                <div class="odds-outcome">${outcomeName}</div>
                <div class="odds-price">${displayPriceForInput != null ? parseFloat(displayPriceForInput).toFixed(3) : 'N/A'}</div>
                <div class="implied-probability">${prominentImpliedProbDisplay}</div>
                <div class="odds-details">${detailsHtml}</div>
            </div>`;
    }
}


function displaySelectedInfo(competitionKey, eventKey) {
    marketOddsInfoElem.innerHTML = ''; 
    bttsInfoElem.innerHTML = ''; 
    totalGoalsInfoElem.innerHTML = ''; 
    firstHalfTotalGoalsInfoElem.innerHTML = ''; 
    expectedGoalsInfoElem.innerHTML = '<p class="text-xs text-gray-500">Select an event.</p>'; 
    selectedEventNameElem.textContent = '-';
    selectedEventTimeElem.textContent = '-';
    modeToggleContainer.classList.add('hidden'); 
    manualInputTypeSelector.classList.add('hidden');
    supremacyExpectancyInputsDiv.classList.add('hidden');
    desiredMarginInputContainer.classList.add('hidden');

    document.querySelectorAll('.event-item').forEach(item => item.classList.remove('selected'));
    if (eventKey) {
        const currentEventElement = eventsListDiv.querySelector(`.event-item[data-event-key="${eventKey}"]`);
        if (currentEventElement) currentEventElement.classList.add('selected');
    }

    if (!competitionKey || !eventKey) { return; }
    
    const competition = allEventsData.find(comp => comp.key === competitionKey);
    if (!competition) { selectedEventNameElem.textContent = 'Comp not found'; return; }

    const event = competition.events.find(evt => evt.key === eventKey);
    if (!event) { selectedEventNameElem.textContent = 'Event not found'; return; }

    selectedEventNameElem.textContent = event.name || 'N/A';
    modeToggleContainer.classList.remove('hidden'); 
    const isCurrentlyManual = !!manualModeEvents[eventKey];
    manualModeToggle.checked = isCurrentlyManual; 
    currentEventKeyForManualMode = eventKey;

    const savedDesiredMargin = localStorage.getItem(LS_DESIRED_MARGIN);

    if (isCurrentlyManual) {
        manualInputTypeSelector.classList.remove('hidden');
        document.querySelector(`input[name="manualInputType"][value="${currentManualInputType}"]`).checked = true;
        
        let currentMarginForDisplay = parseFloat(manualModeEvents[eventKey]?.desiredMargin * 100 || (savedDesiredMargin ? parseFloat(savedDesiredMargin) * 100 : 5.0)).toFixed(1);
        if (manualModeEvents[eventKey] && manualModeEvents[eventKey].desiredMargin === undefined && savedDesiredMargin) {
            manualModeEvents[eventKey].desiredMargin = parseFloat(savedDesiredMargin);
        }


        if (currentManualInputType === 'supremacy') {
            supremacyExpectancyInputsDiv.classList.remove('hidden');
            desiredMarginInputContainer.classList.remove('hidden');
            manualSupremacyInput.value = parseFloat(manualModeEvents[eventKey]?.supremacy || 0).toFixed(2);
            manualExpectancyInput.value = parseFloat(manualModeEvents[eventKey]?.totalExpectedGoals || 2.5).toFixed(2);
            desiredMarginInput.value = currentMarginForDisplay;
        } else if (currentManualInputType === 'semi_auto') {
            supremacyExpectancyInputsDiv.classList.add('hidden'); 
            desiredMarginInputContainer.classList.remove('hidden');
            desiredMarginInput.value = currentMarginForDisplay;
        } else { 
             supremacyExpectancyInputsDiv.classList.add('hidden');
             desiredMarginInputContainer.classList.add('hidden');
        }
    }


    if (event.cutoffTime) {
        try {
            const eventDate = new Date(event.cutoffTime);
            const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
            selectedEventTimeElem.textContent = eventDate.toLocaleString(undefined, options);
        } catch (e) { selectedEventTimeElem.textContent = "Invalid Date"; }
    } else { selectedEventTimeElem.textContent = "Not available"; }

    const isOddsInputDisabled = isCurrentlyManual && (currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto');
    let currentManualEventData = isCurrentlyManual ? manualModeEvents[eventKey] : {};

    let egHomePrice, egAwayPrice, egOver25Price, egUnder25Price;
    let calculatedSupremacy, calculatedTotalXG, lambdaHomeForDisplay, lambdaAwayForDisplay;

    // --- Match Odds ---
    let homeProb = null, drawProb = null, awayProb = null;
    let matchOddsMarginText = "Margin: N/A";
    const matchOddsMarket = event.markets?.['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
    let matchOddsGridHtml = '<div class="odds-grid match-odds-grid">';
    
    if (matchOddsMarket || isCurrentlyManual) { 
        const outcomes = ['home', 'draw', 'away'];
        outcomes.forEach(outcome => {
            const selection = matchOddsMarket?.find(s => s.outcome === outcome);
            const feedPrice = selection ? selection.price : null;
            const feedMaxStake = selection ? selection.maxStake : null;
            const feedProbability = selection ? selection.probability : null;
            
            let currentPriceForCalc = feedPrice; 
            if (isCurrentlyManual) {
                if ((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) {
                    currentPriceForCalc = parseFloat(currentManualEventData.impliedOdds[outcome]);
                } else { 
                    currentPriceForCalc = parseFloat(currentManualEventData[outcome]);
                }
            }
            
            if (outcome === 'home') { homeProb = currentPriceForCalc > 0 ? (1/currentPriceForCalc) : null; egHomePrice = currentPriceForCalc; }
            if (outcome === 'draw') { drawProb = currentPriceForCalc > 0 ? (1/currentPriceForCalc) : null; }
            if (outcome === 'away') { awayProb = currentPriceForCalc > 0 ? (1/currentPriceForCalc) : null; egAwayPrice = currentPriceForCalc; }
            
            matchOddsGridHtml += createOddsSelectionHTML(outcome.charAt(0).toUpperCase() + outcome.slice(1), feedPrice, feedMaxStake, feedProbability, eventKey, 'match_odds', outcome, isCurrentlyManual, currentManualInputType, currentManualEventData );
        });
        if (homeProb && drawProb && awayProb) {
            const sumProbs = homeProb + drawProb + awayProb;
            if (sumProbs > 0 && sumProbs < Infinity) { const margin = (sumProbs - 1) * 100; matchOddsMarginText = `Margin: ${margin.toFixed(2)}%`; }
        }
        matchOddsGridHtml += '</div>';
    } else { matchOddsGridHtml = '<p class="text-xs text-gray-500">Match odds not available.</p>'; }
    marketOddsInfoElem.innerHTML = `<div class="market-title-container"><h3 class="market-title">Match Odds</h3><span class="market-margin">${matchOddsMarginText}</span></div>${matchOddsGridHtml}`;

    // --- Both Teams to Score ---
    let bttsYesProb = null, bttsNoProb = null;
    let bttsMarginText = "Margin: N/A";
    const bttsMarket = event.markets?.['soccer.both_teams_to_score']?.submarkets?.['period=ft']?.selections;
    let bttsGridHtml = '<div class="odds-grid btts-grid">';

    if (bttsMarket || isCurrentlyManual) {
        const outcomes = ['yes', 'no'];
        outcomes.forEach(outcome => {
            const selection = bttsMarket?.find(s => s.outcome === outcome);
            const feedPrice = selection ? selection.price : null;
            const feedMaxStake = selection ? selection.maxStake : null;
            const feedProbability = selection ? selection.probability : null;
            const outcomeType = outcome === 'yes' ? 'bttsYes' : 'bttsNo';

            let currentPriceForCalc = feedPrice;
            if (isCurrentlyManual) {
                 if ((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) {
                    currentPriceForCalc = parseFloat(currentManualEventData.impliedOdds[outcomeType]);
                } else {
                    currentPriceForCalc = parseFloat(currentManualEventData[outcomeType]);
                }
            }
            if (outcome === 'yes') { bttsYesProb = currentPriceForCalc > 0 ? (1/currentPriceForCalc) : null; }
            if (outcome === 'no') { bttsNoProb = currentPriceForCalc > 0 ? (1/currentPriceForCalc) : null; }

            bttsGridHtml += createOddsSelectionHTML(
                outcome.charAt(0).toUpperCase() + outcome.slice(1), 
                feedPrice, feedMaxStake, feedProbability, 
                eventKey, 'btts', outcomeType, isCurrentlyManual, currentManualInputType, currentManualEventData
            );
        });
        if (bttsYesProb && bttsNoProb) {
            const sumProbs = bttsYesProb + bttsNoProb;
            if (sumProbs > 0 && sumProbs < Infinity) { const margin = (sumProbs - 1) * 100; bttsMarginText = `Margin: ${margin.toFixed(2)}%`; }
        }
         bttsGridHtml += '</div>';
    } else {
        bttsGridHtml = '<p class="text-xs text-gray-500">BTTS odds not available.</p>';
    }
    bttsInfoElem.innerHTML = `<div class="market-title-container"><h3 class="market-title">Both Teams to Score</h3><span class="market-margin">${bttsMarginText}</span></div>${bttsGridHtml}`;


    // --- Total Goals 2.5 (Full Time) ---
    let over25Prob = null, under25Prob = null;
    let totalGoals25MarginText = "Margin: N/A";
    let totalGoalsHtmlContent = "";
    const totalGoalsMarket = event.markets?.['soccer.total_goals']?.submarkets?.['period=ft']?.selections;
    let found25Line = false;
    
    if (totalGoalsMarket || isCurrentlyManual) {
        const over25Selection = totalGoalsMarket?.find(s => s.params === "total=2.5" && s.outcome === "over");
        const under25Selection = totalGoalsMarket?.find(s => s.params === "total=2.5" && s.outcome === "under");

        if (over25Selection || under25Selection || isCurrentlyManual) {
             found25Line = true;
             totalGoalsHtmlContent += `<div class="odds-grid total-goals-options-grid mt-1">`;
            
            const feedOverPrice = over25Selection ? over25Selection.price : null;
            const feedOverMaxStake = over25Selection ? over25Selection.maxStake : null;
            const feedOverProbability = over25Selection ? over25Selection.probability : null;
            let currentOverPriceForCalc = feedOverPrice;
            if(isCurrentlyManual) {
                if((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) currentOverPriceForCalc = parseFloat(currentManualEventData.impliedOdds.over25);
                else currentOverPriceForCalc = parseFloat(currentManualEventData.over25);
            }
            over25Prob = currentOverPriceForCalc > 0 ? (1/currentOverPriceForCalc) : null;
            egOver25Price = currentOverPriceForCalc;
            totalGoalsHtmlContent += createOddsSelectionHTML('Over 2.5', feedOverPrice, feedOverMaxStake, feedOverProbability, eventKey, 'total_goals', 'over25', isCurrentlyManual, currentManualInputType, currentManualEventData);

            const feedUnderPrice = under25Selection ? under25Selection.price : null;
            const feedUnderMaxStake = under25Selection ? under25Selection.maxStake : null;
            const feedUnderProbability = under25Selection ? under25Selection.probability : null;
            let currentUnderPriceForCalc = feedUnderPrice;
             if(isCurrentlyManual) {
                if((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) currentUnderPriceForCalc = parseFloat(currentManualEventData.impliedOdds.under25);
                else currentUnderPriceForCalc = parseFloat(currentManualEventData.under25);
            }
            under25Prob = currentUnderPriceForCalc > 0 ? (1/currentUnderPriceForCalc) : null;
            egUnder25Price = currentUnderPriceForCalc;
            totalGoalsHtmlContent += createOddsSelectionHTML('Under 2.5', feedUnderPrice, feedUnderMaxStake, feedUnderProbability, eventKey, 'total_goals', 'under25', isCurrentlyManual, currentManualInputType, currentManualEventData);
            
            totalGoalsHtmlContent += `</div>`;

            if (over25Prob && under25Prob) {
                const sumProbs = over25Prob + under25Prob;
                if (sumProbs > 0 && sumProbs < Infinity) { const margin = (sumProbs - 1) * 100; totalGoals25MarginText = `Margin: ${margin.toFixed(2)}%`;}
            }
        }
    }
    if (!found25Line && !isCurrentlyManual) { 
        totalGoalsHtmlContent = '<p class="text-xs text-gray-500">Total 2.5 goals line not available for this event.</p>';
        totalGoals25MarginText = ''; 
    }
    totalGoalsInfoElem.innerHTML = `<div class="market-title-container"><h3 class="market-title">Total Goals 2.5 (Full Time)</h3><span class="market-margin">${totalGoals25MarginText}</span></div>${totalGoalsHtmlContent}`;

    // --- Total Goals First Half (1.5 or 0.5) ---
    let fhOverProb = null, fhUnderProb = null;
    let fhMarginText = "Margin: N/A";
    let fhHtmlContent = "";
    let displayedFHLine = null;
    let fhOutcomeTypeOver = null, fhOutcomeTypeUnder = null;

    const fhTotalGoalsMarketAll = event.markets?.['soccer.total_goals_period_first_half']?.submarkets;
    let fhSelections = null;

    if (fhTotalGoalsMarketAll) {
        const submarketKey15_fh = `period=fh;total=1.5`;
        const submarketKey15_1h = `period=1h;total=1.5`;
        const submarketKey05_fh = `period=fh;total=0.5`;
        const submarketKey05_1h = `period=1h;total=0.5`;

        if (fhTotalGoalsMarketAll[submarketKey15_fh]) {
            fhSelections = fhTotalGoalsMarketAll[submarketKey15_fh].selections;
            displayedFHLine = 1.5;
            fhOutcomeTypeOver = 'over15FH'; fhOutcomeTypeUnder = 'under15FH';
        } else if (fhTotalGoalsMarketAll[submarketKey15_1h]) {
            fhSelections = fhTotalGoalsMarketAll[submarketKey15_1h].selections;
            displayedFHLine = 1.5;
            fhOutcomeTypeOver = 'over15FH'; fhOutcomeTypeUnder = 'under15FH';
        } else if (fhTotalGoalsMarketAll[submarketKey05_fh]) {
            fhSelections = fhTotalGoalsMarketAll[submarketKey05_fh].selections;
            displayedFHLine = 0.5;
            fhOutcomeTypeOver = 'over05FH'; fhOutcomeTypeUnder = 'under05FH';
        } else if (fhTotalGoalsMarketAll[submarketKey05_1h]) {
             fhSelections = fhTotalGoalsMarketAll[submarketKey05_1h].selections;
            displayedFHLine = 0.5;
            fhOutcomeTypeOver = 'over05FH'; fhOutcomeTypeUnder = 'under05FH';
        }
    }
    
    if (fhSelections || isCurrentlyManual) {
        if (isCurrentlyManual && !displayedFHLine) { 
            displayedFHLine = 1.5; 
            fhOutcomeTypeOver = 'over15FH'; fhOutcomeTypeUnder = 'under15FH';
        }

        if (displayedFHLine) { 
            const overSelection = fhSelections?.find(s => s.outcome === "over");
            const underSelection = fhSelections?.find(s => s.outcome === "under");
            
            fhHtmlContent += `<div class="odds-grid total-goals-options-grid mt-1">`;

            const feedOverPrice = overSelection ? overSelection.price : null;
            const feedOverMaxStake = overSelection ? overSelection.maxStake : null;
            const feedOverProbability = overSelection ? overSelection.probability : null;
            let currentOverPriceForCalc = feedOverPrice;
            if(isCurrentlyManual) {
                if((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) currentOverPriceForCalc = parseFloat(currentManualEventData.impliedOdds[fhOutcomeTypeOver]);
                else currentOverPriceForCalc = parseFloat(currentManualEventData[fhOutcomeTypeOver]);
            }
            fhOverProb = currentOverPriceForCalc > 0 ? (1/currentOverPriceForCalc) : null;
            fhHtmlContent += createOddsSelectionHTML(`Over ${displayedFHLine}`, feedOverPrice, feedOverMaxStake, feedOverProbability, eventKey, 'fh_total_goals', fhOutcomeTypeOver, isCurrentlyManual, currentManualInputType, currentManualEventData);
            
            const feedUnderPrice = underSelection ? underSelection.price : null;
            const feedUnderMaxStake = underSelection ? underSelection.maxStake : null;
            const feedUnderProbability = underSelection ? underSelection.probability : null;
            let currentUnderPriceForCalc = feedUnderPrice;
            if(isCurrentlyManual) {
                 if((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) currentUnderPriceForCalc = parseFloat(currentManualEventData.impliedOdds[fhOutcomeTypeUnder]);
                else currentUnderPriceForCalc = parseFloat(currentManualEventData[fhOutcomeTypeUnder]);
            }
            fhUnderProb = currentUnderPriceForCalc > 0 ? (1/currentUnderPriceForCalc) : null;
            fhHtmlContent += createOddsSelectionHTML(`Under ${displayedFHLine}`, feedUnderPrice, feedUnderMaxStake, feedUnderProbability, eventKey, 'fh_total_goals', fhOutcomeTypeUnder, isCurrentlyManual, currentManualInputType, currentManualEventData);
            
            fhHtmlContent += `</div>`;
            if (fhOverProb && fhUnderProb) {
                const sumProbs = fhOverProb + fhUnderProb;
                if (sumProbs > 0 && sumProbs < Infinity) { const margin = (sumProbs - 1) * 100; fhMarginText = `Margin: ${margin.toFixed(2)}%`; }
            }
        } else if (!isCurrentlyManual) { 
             fhHtmlContent = `<p class="text-xs text-gray-500">1H Total Goals ${displayedFHLine || "1.5/0.5"} not available.</p>`;
             fhMarginText = '';
        }

    } else { 
        fhHtmlContent = `<p class="text-xs text-gray-500">1H Total Goals not available.</p>`;
        fhMarginText = '';
    }
    firstHalfTotalGoalsInfoElem.innerHTML = `<div class="market-title-container"><h3 class="market-title">Total Goals 1st Half ${displayedFHLine || ''}</h3><span class="market-margin">${fhMarginText}</span></div>${fhHtmlContent}`;


    // --- Update Expected Goals Display (based on FT 1X2 and FT O/U 2.5) ---
    if (isCurrentlyManual && currentManualInputType === 'supremacy') {
        const supremacy = parseFloat(manualModeEvents[eventKey]?.supremacy || 0);
        const totalXG = parseFloat(manualModeEvents[eventKey]?.totalExpectedGoals || 0);
        lambdaHomeForDisplay = (totalXG + supremacy) / 2;
        lambdaAwayForDisplay = (totalXG - supremacy) / 2;
        calculatedSupremacy = supremacy;
        calculatedTotalXG = totalXG;
         if (lambdaHomeForDisplay < 0.01) lambdaHomeForDisplay = 0.01; 
         if (lambdaAwayForDisplay < 0.01) lambdaAwayForDisplay = 0.01;
    } else if (egHomePrice && egAwayPrice && egOver25Price && egUnder25Price) { 
        const xgResult = calculateExpectedGoalsFromPrices(egOver25Price, egUnder25Price, egHomePrice, egAwayPrice);
        if (xgResult) {
            lambdaHomeForDisplay = xgResult.lambdaHome;
            lambdaAwayForDisplay = xgResult.lambdaAway;
            calculatedTotalXG = xgResult.totalExpectedGoals;
            calculatedSupremacy = xgResult.supremacy;
            if (isCurrentlyManual && manualModeEvents[eventKey]) { 
                manualModeEvents[eventKey].supremacy = calculatedSupremacy.toFixed(2);
                manualModeEvents[eventKey].totalExpectedGoals = calculatedTotalXG.toFixed(2);
            }
        }
    }
    updateExpectedGoalsDisplay(eventKey, lambdaHomeForDisplay, lambdaAwayForDisplay, calculatedTotalXG, calculatedSupremacy);
    
    attachManualInputListeners(); 
}
        

        function attachManualInputListeners() {
            document.querySelectorAll('.manual-odds-input').forEach(input => {
                input.removeEventListener('change', handleManualOddChange); 
                input.addEventListener('change', handleManualOddChange);
            });
            manualSupremacyInput.removeEventListener('change', handleSupremacyExpectancyChange);
            manualExpectancyInput.removeEventListener('change', handleSupremacyExpectancyChange);
            desiredMarginInput.removeEventListener('change', handleDesiredMarginChange);

            manualSupremacyInput.addEventListener('change', handleSupremacyExpectancyChange);
            manualExpectancyInput.addEventListener('change', handleSupremacyExpectancyChange);
            desiredMarginInput.addEventListener('change', handleDesiredMarginChange);

        }

        function handleManualOddChange(e) {
            const input = e.target;
            if (!input.dataset.eventKey || !input.dataset.marketType || !input.dataset.outcomeType) {
                return; 
            }

            const eventKey = input.dataset.eventKey;
            const outcomeType = input.dataset.outcomeType;
            const newValue = parseFloat(input.value);

            if (manualModeEvents[eventKey] && !isNaN(newValue) && newValue > 0) {
                manualModeEvents[eventKey][outcomeType] = newValue.toFixed(3); 
                delete manualModeEvents[eventKey].supremacy;
                delete manualModeEvents[eventKey].totalExpectedGoals;
                delete manualModeEvents[eventKey].impliedOdds; 
                displaySelectedInfo(competitionsDropdown.value, eventKey);
            } else {
                 console.warn("Invalid manual odds input for outcome:", newValue, "for", outcomeType);
            }
        }
        
        function handleDesiredMarginChange() {
            const eventKey = currentEventKeyForManualMode;
            if (!manualModeEvents[eventKey]) return;
            const newMarginDecimal = parseFloat(desiredMarginInput.value) / 100;

            if (!isNaN(newMarginDecimal) && newMarginDecimal >= 0 && newMarginDecimal < 1) {
                 manualModeEvents[eventKey].desiredMargin = newMarginDecimal;
                 localStorage.setItem(LS_DESIRED_MARGIN, newMarginDecimal.toString()); 

                 if (currentManualInputType === 'supremacy') {
                     handleSupremacyExpectancyChange(); 
                 } else if (currentManualInputType === 'semi_auto') {
                     runSemiAutoCalculation(eventKey);
                 }
            } else {
                console.warn("Invalid desired margin input");
                const storedMargin = localStorage.getItem(LS_DESIRED_MARGIN);
                desiredMarginInput.value = parseFloat(manualModeEvents[eventKey].desiredMargin * 100 || (storedMargin ? parseFloat(storedMargin) * 100 : 5.0)).toFixed(1); 
            }
        }


        function handleSupremacyExpectancyChange() {
            const eventKey = currentEventKeyForManualMode;
            if (!manualModeEvents[eventKey] || currentManualInputType !== 'supremacy') return;

            const supremacy = parseFloat(manualSupremacyInput.value);
            const expectancy = parseFloat(manualExpectancyInput.value);
            
            let desiredMarginValue = manualModeEvents[eventKey]?.desiredMargin;
            if (desiredMarginValue === undefined) {
                const storedMargin = localStorage.getItem(LS_DESIRED_MARGIN);
                desiredMarginValue = storedMargin ? parseFloat(storedMargin) : 0.05; 
                manualModeEvents[eventKey].desiredMargin = desiredMarginValue; 
            }
             desiredMarginInput.value = (desiredMarginValue * 100).toFixed(1); 


            if (!isNaN(supremacy) && !isNaN(expectancy) && expectancy >=0) {
                manualModeEvents[eventKey].supremacy = supremacy.toFixed(2);
                manualModeEvents[eventKey].totalExpectedGoals = expectancy.toFixed(2);
                
                let lambdaHome = (expectancy + supremacy) / 2;
                let lambdaAway = (expectancy - supremacy) / 2;

                if (lambdaHome < 0.01) lambdaHome = 0.01; 
                if (lambdaAway < 0.01) lambdaAway = 0.01;

                const fairProbs = calculateFairProbsFromLambdas(lambdaHome, lambdaAway);
                const implied = applyMarginToFairProbs(fairProbs, desiredMarginValue);
                
                manualModeEvents[eventKey].impliedOdds = implied; 

                manualModeEvents[eventKey].home = implied.home;
                manualModeEvents[eventKey].draw = implied.draw;
                manualModeEvents[eventKey].away = implied.away;
                manualModeEvents[eventKey].over25 = implied.over25;
                manualModeEvents[eventKey].under25 = implied.under25;
                manualModeEvents[eventKey].bttsYes = implied.bttsYes;
                manualModeEvents[eventKey].bttsNo = implied.bttsNo;
                manualModeEvents[eventKey].over05FH = implied.over05FH !== "N/A" ? implied.over05FH : (manualModeEvents[eventKey].over05FH || "1.001");
                manualModeEvents[eventKey].under05FH = implied.under05FH !== "N/A" ? implied.under05FH : (manualModeEvents[eventKey].under05FH || "1.001");
                manualModeEvents[eventKey].over15FH = implied.over15FH !== "N/A" ? implied.over15FH : (manualModeEvents[eventKey].over15FH || "1.001");
                manualModeEvents[eventKey].under15FH = implied.under15FH !== "N/A" ? implied.under15FH : (manualModeEvents[eventKey].under15FH || "1.001");


                displaySelectedInfo(competitionsDropdown.value, eventKey);
            } else {
                console.warn("Invalid supremacy/expectancy input");
            }
        }

        function runSemiAutoCalculation(eventKey) {
            if (!eventKey || !manualModeEvents[eventKey] || currentManualInputType !== 'semi_auto') return;

            const competition = allEventsData.find(comp => comp.events.some(evt => evt.key === eventKey));
            const eventData = competition?.events.find(evt => evt.key === eventKey);
            if (!eventData || !eventData.markets) {
                console.warn("Semi-Auto: Feed event data not found.");
                return;
            }

            let desiredMarginValue = manualModeEvents[eventKey]?.desiredMargin;
            if (desiredMarginValue === undefined) {
                const storedMargin = localStorage.getItem(LS_DESIRED_MARGIN);
                desiredMarginValue = storedMargin ? parseFloat(storedMargin) : 0.05;
                manualModeEvents[eventKey].desiredMargin = desiredMarginValue;
            }
            desiredMarginInput.value = (desiredMarginValue * 100).toFixed(1);


            const matchOddsApi = eventData.markets['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
            const bttsApi = eventData.markets['soccer.both_teams_to_score']?.submarkets?.['period=ft']?.selections;
            const totalGoalsApi = eventData.markets['soccer.total_goals']?.submarkets?.['period=ft']?.selections;
            const fhTotalGoalsApiMarket = eventData.markets['soccer.total_goals_period_first_half']?.submarkets;
            let fhTotalGoalsApi_1_5 = null, fhTotalGoalsApi_0_5 = null;

            if(fhTotalGoalsApiMarket) { 
                 fhTotalGoalsApi_1_5 = fhTotalGoalsApiMarket[`period=fh;total=1.5`]?.selections || 
                                   fhTotalGoalsApiMarket[`period=1h;total=1.5`]?.selections;
                 fhTotalGoalsApi_0_5 = fhTotalGoalsApiMarket[`period=fh;total=0.5`]?.selections ||
                                   fhTotalGoalsApiMarket[`period=1h;total=0.5`]?.selections;
            }


            let feedHomeP=null, feedDrawP=null, feedAwayP=null;
            let feedBttsYesP=null, feedBttsNoP=null;
            let feedOver25P=null, feedUnder25P=null;
            let feedOver05FHP=null, feedUnder05FHP=null; 
            let feedOver15FHP=null, feedUnder15FHP=null;


            if (matchOddsApi) {
                feedHomeP = matchOddsApi.find(s => s.outcome === 'home')?.price;
                feedDrawP = matchOddsApi.find(s => s.outcome === 'draw')?.price;
                feedAwayP = matchOddsApi.find(s => s.outcome === 'away')?.price;
            }
            if (bttsApi) {
                feedBttsYesP = bttsApi.find(s => s.outcome === 'yes')?.price;
                feedBttsNoP = bttsApi.find(s => s.outcome === 'no')?.price;
            }
            if (totalGoalsApi) {
                feedOver25P = totalGoalsApi.find(s => s.params === "total=2.5" && s.outcome === "over")?.price;
                feedUnder25P = totalGoalsApi.find(s => s.params === "total=2.5" && s.outcome === "under")?.price;
            }
            if (fhTotalGoalsApi_1_5) {
                feedOver15FHP = fhTotalGoalsApi_1_5.find(s => s.outcome === "over")?.price;
                feedUnder15FHP = fhTotalGoalsApi_1_5.find(s => s.outcome === "under")?.price;
            }
            if (fhTotalGoalsApi_0_5) {
                feedOver05FHP = fhTotalGoalsApi_0_5.find(s => s.outcome === "over")?.price;
                feedUnder05FHP = fhTotalGoalsApi_0_5.find(s => s.outcome === "under")?.price;
            }
            
            const fairProbs = {};
            if (feedHomeP && feedDrawP && feedAwayP) {
                const ipH = 1/feedHomeP, ipD = 1/feedDrawP, ipA = 1/feedAwayP;
                const booksum1X2 = ipH + ipD + ipA;
                fairProbs.home = booksum1X2 > 0 ? ipH / booksum1X2 : 0;
                fairProbs.draw = booksum1X2 > 0 ? ipD / booksum1X2 : 0;
                fairProbs.away = booksum1X2 > 0 ? ipA / booksum1X2 : 0;
            }
             if (feedBttsYesP && feedBttsNoP) {
                const ipBYes = 1/feedBttsYesP, ipBNo = 1/feedBttsNoP;
                const booksumBtts = ipBYes + ipBNo;
                fairProbs.bttsYes = booksumBtts > 0 ? ipBYes / booksumBtts : 0;
                fairProbs.bttsNo = booksumBtts > 0 ? ipBNo / booksumBtts : 0;
            }
            if (feedOver25P && feedUnder25P) {
                const ipO25 = 1/feedOver25P, ipU25 = 1/feedUnder25P;
                const booksumOU25 = ipO25 + ipU25;
                fairProbs.over25 = booksumOU25 > 0 ? ipO25 / booksumOU25 : 0;
                fairProbs.under25 = booksumOU25 > 0 ? ipU25 / booksumOU25 : 0;
            }
             if (feedOver15FHP && feedUnder15FHP) {
                const ipO15FH = 1/feedOver15FHP, ipU15FH = 1/feedUnder15FHP;
                const booksumOU15FH = ipO15FH + ipU15FH;
                fairProbs.over15FH = booksumOU15FH > 0 ? ipO15FH / booksumOU15FH : 0;
                fairProbs.under15FH = booksumOU15FH > 0 ? ipU15FH / booksumOU15FH : 0;
            }
            if (fhTotalGoalsApi_0_5) { 
                const ipO05FH = 1/feedOver05FHP, ipU05FH = 1/feedUnder05FHP;
                const booksumOU05FH = ipO05FH + ipU05FH;
                fairProbs.over05FH = booksumOU05FH > 0 ? ipO05FH / booksumOU05FH : 0;
                fairProbs.under05FH = booksumOU05FH > 0 ? ipU05FH / booksumOU05FH : 0;
            }


            const newOddsWithUserMargin = applyMarginToFairProbs(fairProbs, desiredMarginValue);
            manualModeEvents[eventKey].impliedOdds = newOddsWithUserMargin;

            manualModeEvents[eventKey].home = newOddsWithUserMargin.home !== "N/A" ? newOddsWithUserMargin.home : (feedHomeP || 1.001).toFixed(3);
            manualModeEvents[eventKey].draw = newOddsWithUserMargin.draw !== "N/A" ? newOddsWithUserMargin.draw : (feedDrawP || 1.001).toFixed(3);
            manualModeEvents[eventKey].away = newOddsWithUserMargin.away !== "N/A" ? newOddsWithUserMargin.away : (feedAwayP || 1.001).toFixed(3);
            manualModeEvents[eventKey].bttsYes = newOddsWithUserMargin.bttsYes !== "N/A" ? newOddsWithUserMargin.bttsYes : (feedBttsYesP || 1.001).toFixed(3);
            manualModeEvents[eventKey].bttsNo = newOddsWithUserMargin.bttsNo !== "N/A" ? newOddsWithUserMargin.bttsNo : (feedBttsNoP || 1.001).toFixed(3);
            manualModeEvents[eventKey].over25 = newOddsWithUserMargin.over25 !== "N/A" ? newOddsWithUserMargin.over25 : (feedOver25P || 1.001).toFixed(3);
            manualModeEvents[eventKey].under25 = newOddsWithUserMargin.under25 !== "N/A" ? newOddsWithUserMargin.under25 : (feedUnder25P || 1.001).toFixed(3);
            
            manualModeEvents[eventKey].over15FH = newOddsWithUserMargin.over15FH !== "N/A" ? newOddsWithUserMargin.over15FH : (feedOver15FHP || 1.001).toFixed(3);
            manualModeEvents[eventKey].under15FH = newOddsWithUserMargin.under15FH !== "N/A" ? newOddsWithUserMargin.under15FH : (feedUnder15FHP || 1.001).toFixed(3);
            manualModeEvents[eventKey].over05FH = newOddsWithUserMargin.over05FH !== "N/A" ? newOddsWithUserMargin.over05FH : (feedOver05FHP || 1.001).toFixed(3);
            manualModeEvents[eventKey].under05FH = newOddsWithUserMargin.under05FH !== "N/A" ? newOddsWithUserMargin.under05FH : (feedUnder05FHP || 1.001).toFixed(3);
            
            const xgResult = calculateExpectedGoalsFromPrices(
                parseFloat(manualModeEvents[eventKey].over25),
                parseFloat(manualModeEvents[eventKey].under25),
                parseFloat(manualModeEvents[eventKey].home),
                parseFloat(manualModeEvents[eventKey].away)
            );
            if (xgResult) {
                manualModeEvents[eventKey].supremacy = xgResult.supremacy.toFixed(2);
                manualModeEvents[eventKey].totalExpectedGoals = xgResult.totalExpectedGoals.toFixed(2);
            }
            
            displaySelectedInfo(competitionsDropdown.value, eventKey);
        }
        
        document.querySelectorAll('input[name="manualInputType"]').forEach(radio => {
            radio.addEventListener('change', function() {
                currentManualInputType = this.value;
                const eventKey = currentEventKeyForManualMode;
                if (eventKey && manualModeEvents[eventKey]) { 
                     if (this.value === 'supremacy') {
                        supremacyExpectancyInputsDiv.classList.remove('hidden');
                        desiredMarginInputContainer.classList.remove('hidden');
                        manualSupremacyInput.value = parseFloat(manualModeEvents[eventKey].supremacy || 0).toFixed(2);
                        manualExpectancyInput.value = parseFloat(manualModeEvents[eventKey].totalExpectedGoals || 2.5).toFixed(2);
                        
                        let marginToSet = manualModeEvents[eventKey]?.desiredMargin;
                        if(marginToSet === undefined) marginToSet = parseFloat(localStorage.getItem(LS_DESIRED_MARGIN) || 0.05);
                        desiredMarginInput.value = (marginToSet * 100).toFixed(1);
                        manualModeEvents[eventKey].desiredMargin = marginToSet; 

                        handleSupremacyExpectancyChange(); 
                    } else if (this.value === 'semi_auto') {
                        supremacyExpectancyInputsDiv.classList.add('hidden'); 
                        desiredMarginInputContainer.classList.remove('hidden');
                        
                        let marginToSet = manualModeEvents[eventKey]?.desiredMargin;
                        if(marginToSet === undefined) marginToSet = parseFloat(localStorage.getItem(LS_DESIRED_MARGIN) || 0.05);
                        desiredMarginInput.value = (marginToSet * 100).toFixed(1);
                        manualModeEvents[eventKey].desiredMargin = marginToSet;

                        runSemiAutoCalculation(eventKey); 
                    } else { // 'odds'
                        supremacyExpectancyInputsDiv.classList.add('hidden');
                        desiredMarginInputContainer.classList.add('hidden');
                        if (manualModeEvents[eventKey]) {
                             delete manualModeEvents[eventKey].impliedOdds;
                             const xgResult = calculateExpectedGoalsFromPrices(
                                parseFloat(manualModeEvents[eventKey].over25),
                                parseFloat(manualModeEvents[eventKey].under25),
                                parseFloat(manualModeEvents[eventKey].home),
                                parseFloat(manualModeEvents[eventKey].away)
                            );
                            if (xgResult) {
                                manualModeEvents[eventKey].supremacy = xgResult.supremacy.toFixed(2);
                                manualModeEvents[eventKey].totalExpectedGoals = xgResult.totalExpectedGoals.toFixed(2);
                            }
                        }
                    }
                }
                displaySelectedInfo(competitionsDropdown.value, eventKey); 
            });
        });

        manualModeToggle.addEventListener('change', function() {
            const eventKey = currentEventKeyForManualMode;
            if (!eventKey) return;

            if (this.checked) { 
                manualModeEvents[eventKey] = {}; 
                const competition = allEventsData.find(comp => comp.events.some(evt => evt.key === eventKey));
                const eventData = competition?.events.find(evt => evt.key === eventKey);
                let initialSupremacy = 0;
                let initialExpectancy = 2.5;
                let homeP=1.001, drawP=1.001, awayP=1.001;
                let overP25=1.001, underP25=1.001;
                let bttsYesP=1.001, bttsNoP=1.001;
                let overP05FH=1.001, underP05FH=1.001;
                let overP15FH=1.001, underP15FH=1.001;


                if (eventData?.markets) {
                    const matchOddsApi = eventData.markets['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
                    const bttsApi = eventData.markets['soccer.both_teams_to_score']?.submarkets?.['period=ft']?.selections;
                    const totalGoalsApi = eventData.markets['soccer.total_goals']?.submarkets?.['period=ft']?.selections;
                    const fhTotalGoalsApiMarket = eventData.markets['soccer.total_goals_period_first_half']?.submarkets;


                    if (matchOddsApi) {
                        homeP = (matchOddsApi.find(s => s.outcome === 'home')?.price || 1.001);
                        drawP = (matchOddsApi.find(s => s.outcome === 'draw')?.price || 1.001);
                        awayP = (matchOddsApi.find(s => s.outcome === 'away')?.price || 1.001);
                    }
                    if (bttsApi) {
                        bttsYesP = (bttsApi.find(s => s.outcome === 'yes')?.price || 1.001);
                        bttsNoP = (bttsApi.find(s => s.outcome === 'no')?.price || 1.001);
                    }
                    if (totalGoalsApi) {
                        overP25 = (totalGoalsApi.find(s => s.params === "total=2.5" && s.outcome === "over")?.price || 1.001);
                        underP25 = (totalGoalsApi.find(s => s.params === "total=2.5" && s.outcome === "under")?.price || 1.001);
                    }
                    if (fhTotalGoalsApiMarket) {
                        const selections15 = fhTotalGoalsApiMarket[`period=fh;total=1.5`]?.selections || fhTotalGoalsApiMarket[`period=1h;total=1.5`]?.selections;
                        const selections05 = fhTotalGoalsApiMarket[`period=fh;total=0.5`]?.selections || fhTotalGoalsApiMarket[`period=1h;total=0.5`]?.selections;
                        if (selections15) {
                            overP15FH = (selections15.find(s => s.outcome === "over")?.price || 1.001);
                            underP15FH = (selections15.find(s => s.outcome === "under")?.price || 1.001);
                        }
                         if (selections05) { 
                            overP05FH = (selections05.find(s => s.outcome === "over")?.price || 1.001);
                            underP05FH = (selections05.find(s => s.outcome === "under")?.price || 1.001);
                        }
                    }
                }
                manualModeEvents[eventKey].home = parseFloat(homeP).toFixed(3);
                manualModeEvents[eventKey].draw = parseFloat(drawP).toFixed(3);
                manualModeEvents[eventKey].away = parseFloat(awayP).toFixed(3);
                manualModeEvents[eventKey].bttsYes = parseFloat(bttsYesP).toFixed(3);
                manualModeEvents[eventKey].bttsNo = parseFloat(bttsNoP).toFixed(3);
                manualModeEvents[eventKey].over25 = parseFloat(overP25).toFixed(3);
                manualModeEvents[eventKey].under25 = parseFloat(underP25).toFixed(3);
                manualModeEvents[eventKey].over05FH = parseFloat(overP05FH).toFixed(3); 
                manualModeEvents[eventKey].under05FH = parseFloat(underP05FH).toFixed(3);
                manualModeEvents[eventKey].over15FH = parseFloat(overP15FH).toFixed(3);
                manualModeEvents[eventKey].under15FH = parseFloat(underP15FH).toFixed(3);


                 const xgResult = calculateExpectedGoalsFromPrices(
                    parseFloat(manualModeEvents[eventKey].over25),
                    parseFloat(manualModeEvents[eventKey].under25),
                    parseFloat(manualModeEvents[eventKey].home),
                    parseFloat(manualModeEvents[eventKey].away)
                );
                if (xgResult) {
                    initialSupremacy = xgResult.supremacy;
                    initialExpectancy = xgResult.totalExpectedGoals;
                }
                
                manualModeEvents[eventKey].supremacy = initialSupremacy.toFixed(2);
                manualModeEvents[eventKey].totalExpectedGoals = initialExpectancy.toFixed(2);
                
                const savedMargin = localStorage.getItem(LS_DESIRED_MARGIN);
                manualModeEvents[eventKey].desiredMargin = savedMargin ? parseFloat(savedMargin) : 0.05;
                
                manualInputTypeSelector.classList.remove('hidden');
                document.querySelector('input[name="manualInputType"][value="odds"]').checked = true;
                currentManualInputType = 'odds';
                supremacyExpectancyInputsDiv.classList.add('hidden');
                desiredMarginInputContainer.classList.add('hidden');

            } else { 
                delete manualModeEvents[eventKey];
                manualInputTypeSelector.classList.add('hidden');
                supremacyExpectancyInputsDiv.classList.add('hidden');
                desiredMarginInputContainer.classList.add('hidden');
            }
            displaySelectedInfo(competitionsDropdown.value, eventKey);
        });

        competitionsDropdown.addEventListener('change', (e) => {
            const key = e.target.value;
            if (key) {
                localStorage.setItem(LS_LAST_COMPETITION_KEY, key);
            } else {
                localStorage.removeItem(LS_LAST_COMPETITION_KEY);
            }
            selectedEventKeyGlobal = null; 
            populateEventsList(key); 
            if (eventsListDiv.firstChild && eventsListDiv.querySelector('.event-item')) {
                selectedEventKeyGlobal = eventsListDiv.querySelector('.event-item').dataset.eventKey;
            }
            displaySelectedInfo(key, selectedEventKeyGlobal); 
        });

        function loadPersistentSettings() {
            const savedThreshold = localStorage.getItem(LS_MIN_CHANGE_THRESHOLD);
            if (savedThreshold && percentageChangeThresholdInput) {
                percentageChangeThresholdInput.value = parseFloat(savedThreshold).toFixed(1);
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            loadPersistentSettings(); 

            if (percentageChangeThresholdInput) {
                percentageChangeThresholdInput.addEventListener('change', (e) => {
                    const thresholdValue = parseFloat(e.target.value);
                    if (!isNaN(thresholdValue) && thresholdValue >= 0) {
                        localStorage.setItem(LS_MIN_CHANGE_THRESHOLD, thresholdValue.toString());
                    } else { 
                        e.target.value = "1.0";
                        localStorage.setItem(LS_MIN_CHANGE_THRESHOLD, "1.0");
                    }
                });
            }
            
            fetchData(); 
            if (refreshIntervalId) clearInterval(refreshIntervalId); 
            refreshIntervalId = setInterval(() => fetchData(false), REFRESH_INTERVAL_MS);
        });