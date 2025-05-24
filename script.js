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

// Chart Elements
const oddsChartContainer = document.getElementById('oddsChartContainer');
const oddsChartTitle = document.getElementById('oddsChartTitle');
const oddsMovementChartCanvas = document.getElementById('oddsMovementChartCanvas');
const chartNoDataMessage = document.getElementById('chartNoDataMessage');


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
let currentOddsChart = null; 

const PRESELECTED_COMPETITION_KEY = "soccer-germany-dfb-pokal";
const MAX_GOAL_ITERATIONS = 200; 
const FH_XG_RATIO = 0.50; 
const REFRESH_INTERVAL_MS = 30000;
let refreshIntervalId = null;
let isFirstLoad = true;

// localStorage Keys
const LS_MIN_CHANGE_THRESHOLD = 'goalPulse_minChangeThreshold';
const LS_DESIRED_MARGIN = 'goalPulse_desiredMargin';
const LS_LAST_COMPETITION_KEY = 'goalPulse_lastCompetitionKey';

// Value Bet Highlighter Threshold
const VALUE_BET_THRESHOLD_PERCENT = 5; 


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
    let probBttsYes = 0;

    let probUnder05FT = 0, probUnder075FT = 0, probUnder1FT = 0, probUnder125FT = 0, probUnder15FT = 0, probUnder175FT = 0, 
        probUnder2FT = 0, probUnder225FT = 0, probUnder25FT = 0, probUnder275FT = 0, probUnder3FT = 0, probUnder325FT = 0,
        probUnder35FT = 0, probUnder375FT = 0, probUnder4FT = 0, probUnder425FT = 0, probUnder45FT = 0;
    
    const probHome0FT = poissonPmf(0, lambdaHomeFT);
    const probAway0FT = poissonPmf(0, lambdaAwayFT);
    probBttsYes = 1 - probHome0FT - probAway0FT + (probHome0FT * probAway0FT);

    const maxScoreCalc = 20; 
    for (let i = 0; i <= maxScoreCalc; i++) { 
        for (let j = 0; j <= maxScoreCalc; j++) { 
            const jointProb = poissonPmf(i, lambdaHomeFT) * poissonPmf(j, lambdaAwayFT);
            if (isNaN(jointProb) || jointProb === 0) continue;

            if (i > j) probHome += jointProb;
            else if (j > i) probAway += jointProb;
            else probDraw += jointProb;

            const totalGoalsInIteration = i + j;
            if (totalGoalsInIteration < 0.5) probUnder05FT += jointProb;
            if (totalGoalsInIteration < 0.75) probUnder075FT += jointProb;
            if (totalGoalsInIteration < 1.0) probUnder1FT += jointProb;
            if (totalGoalsInIteration < 1.25) probUnder125FT += jointProb;
            if (totalGoalsInIteration < 1.5) probUnder15FT += jointProb;
            if (totalGoalsInIteration < 1.75) probUnder175FT += jointProb;
            if (totalGoalsInIteration < 2.0) probUnder2FT += jointProb;
            if (totalGoalsInIteration < 2.25) probUnder225FT += jointProb;
            if (totalGoalsInIteration < 2.5) probUnder25FT += jointProb;
            if (totalGoalsInIteration < 2.75) probUnder275FT += jointProb;
            if (totalGoalsInIteration < 3.0) probUnder3FT += jointProb;
            if (totalGoalsInIteration < 3.25) probUnder325FT += jointProb;
            if (totalGoalsInIteration < 3.5) probUnder35FT += jointProb;
            if (totalGoalsInIteration < 3.75) probUnder375FT += jointProb;
            if (totalGoalsInIteration < 4.0) probUnder4FT += jointProb;
            if (totalGoalsInIteration < 4.25) probUnder425FT += jointProb;
            if (totalGoalsInIteration < 4.5) probUnder45FT += jointProb;
        }
    }
    const totalMatchProb = probHome + probDraw + probAway; 
     if (totalMatchProb > 0 && Math.abs(1 - totalMatchProb) > 1e-4) { 
        const normFactor = 1 / totalMatchProb;
        probHome *= normFactor;
        probDraw *= normFactor;
        probAway *= normFactor;
    }
    
    const lambdaHomeFH = lambdaHomeFT * FH_XG_RATIO;
    const lambdaAwayFH = lambdaAwayFT * FH_XG_RATIO;
    
    let probUnder05FH = 0, probUnder075FH = 0, probUnder1FH = 0, probUnder125FH = 0, probUnder15FH = 0;

    for (let i = 0; i <= maxScoreCalc; i++) { 
        for (let j = 0; j <= maxScoreCalc; j++) {
            const jointProbFH = poissonPmf(i, lambdaHomeFH) * poissonPmf(j, lambdaAwayFH);
            if (isNaN(jointProbFH) || jointProbFH === 0) continue;

            const totalGoalsFHInIteration = i + j;
            if (totalGoalsFHInIteration < 0.5) probUnder05FH += jointProbFH;
            if (totalGoalsFHInIteration < 0.75) probUnder075FH += jointProbFH;
            if (totalGoalsFHInIteration < 1.0) probUnder1FH += jointProbFH;
            if (totalGoalsFHInIteration < 1.25) probUnder125FH += jointProbFH;
            if (totalGoalsFHInIteration < 1.5) probUnder15FH += jointProbFH;
        }
    }

    return {
        home: probHome, draw: probDraw, away: probAway,
        over05: Math.max(0, 1 - probUnder05FT), under05: probUnder05FT,
        over075: Math.max(0, 1 - probUnder075FT), under075: probUnder075FT,
        over1: Math.max(0, 1 - probUnder1FT), under1: probUnder1FT,
        over125: Math.max(0, 1 - probUnder125FT), under125: probUnder125FT,
        over15: Math.max(0, 1 - probUnder15FT), under15: probUnder15FT,
        over175: Math.max(0, 1 - probUnder175FT), under175: probUnder175FT,
        over2: Math.max(0, 1 - probUnder2FT), under2: probUnder2FT,
        over225: Math.max(0, 1 - probUnder225FT), under225: probUnder225FT,
        over25: Math.max(0, 1 - probUnder25FT), under25: probUnder25FT,
        over275: Math.max(0, 1 - probUnder275FT), under275: probUnder275FT,
        over3: Math.max(0, 1 - probUnder3FT), under3: probUnder3FT,
        over325: Math.max(0, 1 - probUnder325FT), under325: probUnder325FT,
        over35: Math.max(0, 1 - probUnder35FT), under35: probUnder35FT,
        over375: Math.max(0, 1 - probUnder375FT), under375: probUnder375FT,
        over4: Math.max(0, 1 - probUnder4FT), under4: probUnder4FT,
        over425: Math.max(0, 1 - probUnder425FT), under425: probUnder425FT,
        over45: Math.max(0, 1 - probUnder45FT), under45: probUnder45FT,
        bttsYes: probBttsYes, bttsNo: Math.max(0, 1 - probBttsYes),
        over05FH: Math.max(0, 1 - probUnder05FH), under05FH: probUnder05FH,
        over075FH: Math.max(0, 1 - probUnder075FH), under075FH: probUnder075FH,
        over1FH: Math.max(0, 1 - probUnder1FH), under1FH: probUnder1FH,
        over125FH: Math.max(0, 1 - probUnder125FH), under125FH: probUnder125FH,
        over15FH: Math.max(0, 1 - probUnder15FH), under15FH: probUnder15FH
    };
}

function applyMarginToFairProbs(fairProbs, desiredMarginDecimal) {
    const odds = {};
    const outcomes = [
        'home', 'draw', 'away', 
        'over05', 'under05', 'over075', 'under075', 'over1', 'under1', 'over125', 'under125', 
        'over15', 'under15', 'over175', 'under175', 'over2', 'under2', 'over225', 'under225',
        'over25', 'under25', 'over275', 'under275', 'over3', 'under3', 'over325', 'under325',
        'over35', 'under35', 'over375', 'under375', 'over4', 'under4', 'over425', 'under425',
        'over45', 'under45',
        'bttsYes', 'bttsNo', 
        'over05FH', 'under05FH', 'over075FH', 'under075FH', 'over1FH', 'under1FH', 
        'over125FH', 'under125FH', 'over15FH', 'under15FH'
    ];
    outcomes.forEach(outcome => {
        if (fairProbs[outcome] != null && fairProbs[outcome] > 1e-9) { 
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
    const GOAL_LINE_FOR_SOLVER = 2.5; 
    const normalisedUnderTarget = (1/underPrice) / ((1/overPrice) + (1/underPrice));
    const normalisedHomeTarget = (1/homeWinPrice) / ((1/awayWinPrice) + (1/homeWinPrice));

    if (isNaN(normalisedUnderTarget) || isNaN(normalisedHomeTarget)) {
         console.warn("Could not calculate target probs from prices."); return null;
    }
    let currentHomeEG, currentAwayEG, output, incrementTotal, error, previousError;

    output = calculateHomeAndUnderProbs(Math.max(smallPositiveEG, totalGoals/2 + supremacy/2), Math.max(smallPositiveEG, totalGoals/2 - supremacy/2), GOAL_LINE_FOR_SOLVER);
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
        output = calculateHomeAndUnderProbs(currentHomeEG, currentAwayEG, GOAL_LINE_FOR_SOLVER);
        if (isNaN(output.underProb)) { totalGoals -= incrementTotal; break; }
        error = Math.abs(output.underProb - normalisedUnderTarget);
    }
    
    output = calculateHomeAndUnderProbs(Math.max(smallPositiveEG, totalGoals/2 + supremacy/2), Math.max(smallPositiveEG, totalGoals/2 - supremacy/2), GOAL_LINE_FOR_SOLVER);
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
        output = calculateHomeAndUnderProbs(currentHomeEG, currentAwayEG, GOAL_LINE_FOR_SOLVER);
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
    
    displayName = displayName.replace(/\b[a-z]\d{2}[a-z]{2}\b/g, '');
    
    displayName = displayName.trim().replace(/\s+/g, ' '); 
    
    displayName = displayName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return displayName;
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
                        // Ensure param in key is sanitized (e.g. total=1.25 -> total125)
                        const paramKeyPart = params ? params.replace("total=", "").replace(".", "") + "_" : "";
                        const key = `${outcomePrefix}_${paramKeyPart}${o_val}`; 

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
            
            // Process market with all selections if params is null
            const processMarketAllSelections = (marketName, marketKey, submarketKey, outcomePrefix) => {
                const submarket = event.markets?.[marketKey]?.submarkets?.[submarketKey];
                if (submarket?.selections) {
                    submarket.selections.forEach(selection => {
                        const currentPriceFromAPI = selection.price;
                        const paramKeyPart = selection.params ? selection.params.replace("total=", "").replace(".", "") + "_" : "";
                        const key = `${outcomePrefix}_${paramKeyPart}${selection.outcome}`;

                        if (currentPriceFromAPI != null) currentEventOdds[key] = currentPriceFromAPI;

                        const oldPriceNum = prevEventOddsForCurrentEvent[key];
                         if (oldPriceNum != null && currentPriceFromAPI != null && !isNaN(oldPriceNum) && !isNaN(currentPriceFromAPI)) {
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
                                    market: `${marketName} ${selection.params ? selection.params.replace("total=","") : ''}`, 
                                    outcome: selection.outcome.charAt(0).toUpperCase() + selection.outcome.slice(1), 
                                    oldPrice: oldPriceNum, 
                                    newPrice: currentPriceFromAPI,
                                    percentageChange: percentageDifferenceCalc 
                                });
                            }
                        }
                    });
                }
            };


            processMarket("Match Odds", "soccer.match_odds", "period=ft", ['home', 'draw', 'away'], "mo");
            processMarket("BTTS", "soccer.both_teams_to_score", "period=ft", ['yes', 'no'], "btts");
            
            // For Total Goals FT, process all available selections under the submarket
            processMarketAllSelections("Total Goals", "soccer.total_goals", "period=ft", "tg");
            
            // For FH Total Goals, find the correct submarket key first
            const fhTgMarket = event.markets?.['soccer.total_goals_period_first_half']?.submarkets;
            let fhSubmarketKeyToUse = null;
            if (fhTgMarket) {
                if (fhTgMarket['period=1h']) fhSubmarketKeyToUse = 'period=1h';
                else if (fhTgMarket['period=fh']) fhSubmarketKeyToUse = 'period=fh';
                // Add more fallbacks if API uses other keys
            }
            if (fhSubmarketKeyToUse) {
                processMarketAllSelections("1H Total", "soccer.total_goals_period_first_half", fhSubmarketKeyToUse, "fhtg");
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

                const tgAPISelections = event.markets?.['soccer.total_goals']?.submarkets?.['period=ft']?.selections;
                if (tgAPISelections) {
                    tgAPISelections.forEach(s => {
                        const paramKeyPart = s.params ? s.params.replace("total=", "").replace(".", "") + "_" : "";
                        eventOdds[`tg_${paramKeyPart}${s.outcome}`] = s.price;
                    });
                }
                const fhTgAPIMarkets = event.markets?.['soccer.total_goals_period_first_half']?.submarkets;
                if (fhTgAPIMarkets) {
                    let fhSubmarketKeyToUse = null;
                    if (fhTgAPIMarkets['period=1h']) fhSubmarketKeyToUse = 'period=1h';
                    else if (fhTgAPIMarkets['period=fh']) fhSubmarketKeyToUse = 'period=fh';

                    if (fhSubmarketKeyToUse && fhTgAPIMarkets[fhSubmarketKeyToUse]?.selections) {
                        fhTgAPIMarkets[fhSubmarketKeyToUse].selections.forEach(s => {
                             const paramKeyPart = s.params ? s.params.replace("total=", "").replace(".", "") + "_" : "";
                             eventOdds[`fhtg_${paramKeyPart}${s.outcome}`] = s.price;
                        });
                    }
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

function renderOddsMovementChart(eventName, marketNameForLog, outcomeNameForLog) {
    if (!eventName || !marketNameForLog || !outcomeNameForLog) {
        oddsChartContainer.classList.add('hidden');
        return;
    }

    const relevantChanges = oddsChangesLog.filter(change =>
        change.eventName === eventName &&
        change.market === marketNameForLog &&
        change.outcome === outcomeNameForLog
    ).sort((a, b) => a.timestamp - b.timestamp); 

    const labels = [];
    const dataPoints = [];

    if (relevantChanges.length > 0) {
        const firstChange = relevantChanges[0];
        const initialTimestamp = new Date(firstChange.timestamp.getTime() - 1000); 
        labels.push(initialTimestamp.toLocaleTimeString());
        dataPoints.push(firstChange.oldPrice);
    }
    
    relevantChanges.forEach(change => {
        labels.push(change.timestamp.toLocaleTimeString());
        dataPoints.push(change.newPrice);
    });
    
    if (dataPoints.length < 2) { 
        oddsChartContainer.classList.remove('hidden');
        oddsMovementChartCanvas.classList.add('hidden');
        chartNoDataMessage.classList.remove('hidden');
        chartNoDataMessage.textContent = `Not enough data to display chart for ${marketNameForLog} - ${outcomeNameForLog}.`;
        oddsChartTitle.textContent = `Odds Chart: ${marketNameForLog} - ${outcomeNameForLog}`;
        if (currentOddsChart) {
            currentOddsChart.destroy();
            currentOddsChart = null;
        }
        return;
    }


    oddsChartContainer.classList.remove('hidden');
    oddsMovementChartCanvas.classList.remove('hidden');
    chartNoDataMessage.classList.add('hidden');
    oddsChartTitle.textContent = `Odds Chart: ${marketNameForLog} - ${outcomeNameForLog}`;

    if (currentOddsChart) {
        currentOddsChart.destroy();
    }

    const ctx = oddsMovementChartCanvas.getContext('2d');
    currentOddsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Odds for ${outcomeNameForLog}`,
                data: dataPoints,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false, 
                    title: {
                        display: true,
                        text: 'Odds'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time (Session)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            }
        }
    });
}


function createOddsSelectionHTML(outcomeName, feedPrice, feedMaxStake, feedProbability, eventKey, marketType, outcomeType, isEventInManualMode, currentManualEditType, manualEventData, line = null) {
    let displayPriceForInput;
    let detailsHtml;
    const isOddsInputDisabled = isEventInManualMode && (currentManualEditType === 'supremacy' || currentManualEditType === 'semi_auto');
    let prominentImpliedProbDisplay = 'N/A';
    let valueHighlightClass = ''; 

    let marketNameForLog = '';
    let outcomeNameForLog = outcomeName; 

    if (marketType === 'match_odds') marketNameForLog = "Match Odds";
    else if (marketType === 'btts') marketNameForLog = "BTTS";
    else if (marketType === 'total_goals' && line) { 
        marketNameForLog = `Total Goals ${line}`; 
    } else if (marketType === 'fh_total_goals' && line) {
        marketNameForLog = `1H Total ${line}`;
    }
    
    if (outcomeType.toLowerCase().startsWith('over') || outcomeType.toLowerCase().startsWith('under')) {
        outcomeNameForLog = outcomeName.split(' ')[0]; 
    }


    const chartIconSvg = `
        <svg class="chart-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" 
             data-event-name="${selectedEventNameElem.textContent}" 
             data-market-name-log="${marketNameForLog}" 
             data-outcome-name-log="${outcomeNameForLog}">
            <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
        </svg>`;


    if (isEventInManualMode) {
        let manualEffectivePrice; 
        if (currentManualEditType === 'supremacy' || currentManualEditType === 'semi_auto') {
            manualEffectivePrice = parseFloat(manualEventData?.impliedOdds?.[outcomeType] || feedPrice || 1.001);
        } else { 
            manualEffectivePrice = parseFloat(manualEventData?.[outcomeType] || feedPrice || 1.001);
        }
        displayPriceForInput = manualEffectivePrice;

        const feedPriceNum = parseFloat(feedPrice);
        let percentageDifferenceText = 'N/A'; 

        if (!isNaN(manualEffectivePrice) && !isNaN(feedPriceNum) && feedPriceNum !== 0) {
            const percentageDifference = ((manualEffectivePrice - feedPriceNum) / feedPriceNum) * 100;
            percentageDifferenceText = percentageDifference.toFixed(2) + '%';

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
                ${marketNameForLog && outcomeNameForLog && marketNameForLog !== "N/A" ? chartIconSvg : ''}
                <div class="odds-outcome">${outcomeName}</div>
                <input type="number" class="manual-odds-input" step="0.001" value="${parseFloat(displayPriceForInput || 1.001).toFixed(3)}" 
                       data-event-key="${eventKey}" data-market-type="${marketType}" data-outcome-type="${outcomeType}" ${isOddsInputDisabled ? 'disabled' : ''}>
                <div class="implied-probability">${prominentImpliedProbDisplay}</div>
                <div class="odds-details">${detailsHtml}</div>
            </div>`;

    } else { 
        displayPriceForInput = feedPrice;
        valueHighlightClass = ''; 

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
                 ${marketNameForLog && outcomeNameForLog && marketNameForLog !== "N/A" ? chartIconSvg : ''}
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

    if (currentOddsChart) {
        currentOddsChart.destroy();
        currentOddsChart = null;
    }
    oddsChartContainer.classList.add('hidden');
    oddsMovementChartCanvas.classList.remove('hidden'); 
    chartNoDataMessage.classList.add('hidden');


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
    let matchOddsMarginText = "Margin: N/A";
    const matchOddsMarketAPI = event.markets?.['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
    let matchOddsGridHtml = '<div class="odds-grid match-odds-grid">';
    
    if (matchOddsMarketAPI || isCurrentlyManual) { 
        const outcomes = ['home', 'draw', 'away'];
        let effectivePricesForMargin = {};

        outcomes.forEach(outcome => {
            const selection = matchOddsMarketAPI?.find(s => s.outcome === outcome);
            const feedPrice = selection ? selection.price : null;
            const feedMaxStake = selection ? selection.maxStake : null;
            const feedProbability = selection ? selection.probability : null;
            
            let currentDisplayPrice = feedPrice; 
            if (isCurrentlyManual) {
                if ((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) {
                    currentDisplayPrice = parseFloat(currentManualEventData.impliedOdds[outcome] || feedPrice);
                } else { 
                    currentDisplayPrice = parseFloat(currentManualEventData[outcome] || feedPrice);
                }
            }
            effectivePricesForMargin[outcome] = currentDisplayPrice;
            
            // Set prices for xG solver based on feed or direct manual input for these primary markets
            if (outcome === 'home') egHomePrice = (isCurrentlyManual && currentManualInputType === 'odds' && currentManualEventData.home) ? parseFloat(currentManualEventData.home) : feedPrice;
            if (outcome === 'away') egAwayPrice = (isCurrentlyManual && currentManualInputType === 'odds' && currentManualEventData.away) ? parseFloat(currentManualEventData.away) : feedPrice;
            
            matchOddsGridHtml += createOddsSelectionHTML(outcome.charAt(0).toUpperCase() + outcome.slice(1), feedPrice, feedMaxStake, feedProbability, eventKey, 'match_odds', outcome, isCurrentlyManual, currentManualInputType, currentManualEventData );
        });

        if (effectivePricesForMargin.home > 0 && effectivePricesForMargin.draw > 0 && effectivePricesForMargin.away > 0 && 
            !isNaN(effectivePricesForMargin.home) && !isNaN(effectivePricesForMargin.draw) && !isNaN(effectivePricesForMargin.away)) {
            const p1 = 1 / effectivePricesForMargin.home;
            const p2 = 1 / effectivePricesForMargin.draw;
            const p3 = 1 / effectivePricesForMargin.away;
            const sumProbs = p1 + p2 + p3;
            if (sumProbs > 0 && sumProbs < Infinity) { matchOddsMarginText = `Margin: ${((sumProbs - 1) * 100).toFixed(2)}%`; }
        }
        matchOddsGridHtml += '</div>';
    } else { matchOddsGridHtml = '<p class="text-xs text-gray-500">Match odds not available.</p>'; }
    marketOddsInfoElem.innerHTML = `<div class="market-title-container"><h3 class="market-title">Match Odds</h3><span class="market-margin">${matchOddsMarginText}</span></div>${matchOddsGridHtml}`;

    // --- Both Teams to Score ---
    let bttsMarginText = "Margin: N/A";
    const bttsMarketAPI = event.markets?.['soccer.both_teams_to_score']?.submarkets?.['period=ft']?.selections;
    let bttsGridHtml = '<div class="odds-grid btts-grid">';

    if (bttsMarketAPI || isCurrentlyManual) {
        const outcomes = [{api: 'yes', type: 'bttsYes'}, {api: 'no', type: 'bttsNo'}];
        let effectivePricesForBTTSMargin = {};

        outcomes.forEach(o => {
            const selection = bttsMarketAPI?.find(s => s.outcome === o.api);
            const feedPrice = selection ? selection.price : null;
            const feedMaxStake = selection ? selection.maxStake : null;
            const feedProbability = selection ? selection.probability : null;
            
            let currentDisplayPrice = feedPrice;
            if (isCurrentlyManual) {
                 if ((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) {
                    currentDisplayPrice = parseFloat(currentManualEventData.impliedOdds[o.type] || feedPrice);
                } else {
                    currentDisplayPrice = parseFloat(currentManualEventData[o.type] || feedPrice);
                }
            }
            effectivePricesForBTTSMargin[o.api] = currentDisplayPrice;

            bttsGridHtml += createOddsSelectionHTML(
                o.api.charAt(0).toUpperCase() + o.api.slice(1), 
                feedPrice, feedMaxStake, feedProbability, 
                eventKey, 'btts', o.type, isCurrentlyManual, currentManualInputType, currentManualEventData
            );
        });
        if (effectivePricesForBTTSMargin.yes > 0 && effectivePricesForBTTSMargin.no > 0 &&
            !isNaN(effectivePricesForBTTSMargin.yes) && !isNaN(effectivePricesForBTTSMargin.no)) {
            const pYes = 1 / effectivePricesForBTTSMargin.yes;
            const pNo = 1 / effectivePricesForBTTSMargin.no;
            const sumProbs = pYes + pNo;
            if (sumProbs > 0 && sumProbs < Infinity) { bttsMarginText = `Margin: ${((sumProbs - 1) * 100).toFixed(2)}%`;}
        }
         bttsGridHtml += '</div>';
    } else {
        bttsGridHtml = '<p class="text-xs text-gray-500">BTTS odds not available.</p>';
    }
    bttsInfoElem.innerHTML = `<div class="market-title-container"><h3 class="market-title">Both Teams to Score</h3><span class="market-margin">${bttsMarginText}</span></div>${bttsGridHtml}`;


    // --- Total Goals (Full Time) - Expanded ---
    const ftGoalLinesToDisplay = ["0.5", "0.75", "1.0", "1.25", "1.5", "1.75", "2.0", "2.25", "2.5", "2.75", "3.0", "3.25", "3.5", "3.75", "4.0", "4.25", "4.5"];
    let ftTotalGoalsHtmlCombined = '';
    const ftTotalGoalsMarketAPIAll = event.markets?.['soccer.total_goals']?.submarkets?.['period=ft']?.selections;

    ftGoalLinesToDisplay.forEach(line => {
        let lineSpecificHtml = '';
        const outcomeTypeOver = `over${line.replace('.', '')}`;
        const outcomeTypeUnder = `under${line.replace('.', '')}`;

        const apiOverSelection = ftTotalGoalsMarketAPIAll?.find(s => s.params === `total=${line}` && s.outcome === "over");
        const apiUnderSelection = ftTotalGoalsMarketAPIAll?.find(s => s.params === `total=${line}` && s.outcome === "under");

        const feedOverPrice = apiOverSelection ? apiOverSelection.price : null;
        const feedOverMaxStakeOver = apiOverSelection ? apiOverSelection.maxStake : null;
        const feedOverProbability = apiOverSelection ? apiOverSelection.probability : null;
        
        const feedUnderPrice = apiUnderSelection ? apiUnderSelection.price : null;
        const feedUnderMaxStakeUnder = apiUnderSelection ? apiUnderSelection.maxStake : null;
        const feedUnderProbability = apiUnderSelection ? apiUnderSelection.probability : null;

        let effectiveOverPrice = feedOverPrice;
        let effectiveUnderPrice = feedUnderPrice;

        if (isCurrentlyManual) {
            if ((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) {
                effectiveOverPrice = parseFloat(currentManualEventData.impliedOdds?.[outcomeTypeOver] || feedOverPrice);
                effectiveUnderPrice = parseFloat(currentManualEventData.impliedOdds?.[outcomeTypeUnder] || feedUnderPrice);
            } else { 
                effectiveOverPrice = parseFloat(currentManualEventData[outcomeTypeOver] || feedOverPrice);
                effectiveUnderPrice = parseFloat(currentManualEventData[outcomeTypeUnder] || feedUnderPrice);
            }
        }
        
        let currentLineMarginText = "Margin: N/A";
        if (effectiveOverPrice > 0 && effectiveUnderPrice > 0 && !isNaN(effectiveOverPrice) && !isNaN(effectiveUnderPrice)) {
            const overProbMargin = 1 / effectiveOverPrice;
            const underProbMargin = 1 / effectiveUnderPrice;
            const sumProbsMargin = overProbMargin + underProbMargin;
            if (sumProbsMargin > 0 && sumProbsMargin < Infinity) {
                currentLineMarginText = `Margin: ${((sumProbsMargin - 1) * 100).toFixed(2)}%`;
            }
        }
        
        // Only display if API provides it OR if in manual mode and user has values (or xG derived them)
        if (apiOverSelection || apiUnderSelection || (isCurrentlyManual && (currentManualEventData[outcomeTypeOver] || currentManualEventData[outcomeTypeUnder]))) {
            lineSpecificHtml += `<div class="market-title-container mt-3"><h4 class="market-title text-sm font-semibold">Total Goals ${line}</h4><span class="market-margin">${currentLineMarginText}</span></div>`;
            lineSpecificHtml += `<div class="odds-grid total-goals-options-grid mt-1">`;
            lineSpecificHtml += createOddsSelectionHTML(`Over ${line}`, feedOverPrice, feedOverMaxStakeOver, feedOverProbability, eventKey, 'total_goals', outcomeTypeOver, isCurrentlyManual, currentManualInputType, currentManualEventData, line);
            lineSpecificHtml += createOddsSelectionHTML(`Under ${line}`, feedUnderPrice, feedUnderMaxStakeUnder, feedUnderProbability, eventKey, 'total_goals', outcomeTypeUnder, isCurrentlyManual, currentManualInputType, currentManualEventData, line);
            lineSpecificHtml += `</div>`;
            ftTotalGoalsHtmlCombined += lineSpecificHtml;
        }

        if (line === "2.5") { // For xG solver, prioritize feed if available, then manual odds
            egOver25Price = (isCurrentlyManual && currentManualInputType === 'odds' && currentManualEventData.over25) ? parseFloat(currentManualEventData.over25) : feedOverPrice;
            egUnder25Price = (isCurrentlyManual && currentManualInputType === 'odds' && currentManualEventData.under25) ? parseFloat(currentManualEventData.under25) : feedUnderPrice;
        }
    });
    if (!ftTotalGoalsHtmlCombined) {
        ftTotalGoalsHtmlCombined = '<p class="text-xs text-gray-500 mt-1">Full Time Total Goals lines not available.</p>';
    }
    totalGoalsInfoElem.innerHTML = `<div class="market-title-container"><h3 class="market-title">Total Goals (Full Time)</h3></div>${ftTotalGoalsHtmlCombined}`;


    // --- Total Goals First Half (Expanded) ---
    const fhGoalLinesToDisplay = ["0.5", "0.75", "1.0", "1.25", "1.5"];
    let fhTotalGoalsHtmlCombined = '';
    const fhTotalGoalsAPIMarkets = event.markets?.['soccer.total_goals_period_first_half']?.submarkets;
    let fhSelectionsAPI = null;

    if (fhTotalGoalsAPIMarkets) { // Get the correct submarket's selections
        if (fhTotalGoalsAPIMarkets['period=1h']) fhSelectionsAPI = fhTotalGoalsAPIMarkets['period=1h'].selections;
        else if (fhTotalGoalsAPIMarkets['period=fh']) fhSelectionsAPI = fhTotalGoalsAPIMarkets['period=fh'].selections;
    }

    fhGoalLinesToDisplay.forEach(line => {
        let lineSpecificHtmlFH = '';
        const outcomeTypeOverFH = `over${line.replace('.', '')}FH`;
        const outcomeTypeUnderFH = `under${line.replace('.', '')}FH`;

        let apiOverSelectionFH = null, apiUnderSelectionFH = null;
        if(fhSelectionsAPI){
            apiOverSelectionFH = fhSelectionsAPI.find(s => s.params === `total=${line}` && s.outcome === "over");
            apiUnderSelectionFH = fhSelectionsAPI.find(s => s.params === `total=${line}` && s.outcome === "under");
        }

        const feedOverPriceFH = apiOverSelectionFH ? apiOverSelectionFH.price : null;
        const feedOverMaxStakeFH = apiOverSelectionFH ? apiOverSelectionFH.maxStake : null;
        const feedOverProbabilityFH = apiOverSelectionFH ? apiOverSelectionFH.probability : null;

        const feedUnderPriceFH = apiUnderSelectionFH ? apiUnderSelectionFH.price : null;
        const feedUnderMaxStakeFH = apiUnderSelectionFH ? apiUnderSelectionFH.maxStake : null;
        const feedUnderProbabilityFH = apiUnderSelectionFH ? apiUnderSelectionFH.probability : null;

        let effectiveOverPriceFH = feedOverPriceFH;
        let effectiveUnderPriceFH = feedUnderPriceFH;

        if (isCurrentlyManual) {
            if ((currentManualInputType === 'supremacy' || currentManualInputType === 'semi_auto') && currentManualEventData.impliedOdds) {
                effectiveOverPriceFH = parseFloat(currentManualEventData.impliedOdds?.[outcomeTypeOverFH] || feedOverPriceFH);
                effectiveUnderPriceFH = parseFloat(currentManualEventData.impliedOdds?.[outcomeTypeUnderFH] || feedUnderPriceFH);
            } else { 
                effectiveOverPriceFH = parseFloat(currentManualEventData[outcomeTypeOverFH] || feedOverPriceFH);
                effectiveUnderPriceFH = parseFloat(currentManualEventData[outcomeTypeUnderFH] || feedUnderPriceFH);
            }
        }
        
        let currentLineMarginTextFH = "Margin: N/A";
        if (effectiveOverPriceFH > 0 && effectiveUnderPriceFH > 0 && !isNaN(effectiveOverPriceFH) && !isNaN(effectiveUnderPriceFH)) {
            const overProbMarginFH = 1 / effectiveOverPriceFH;
            const underProbMarginFH = 1 / effectiveUnderPriceFH;
            const sumProbsMarginFH = overProbMarginFH + underProbMarginFH;
            if (sumProbsMarginFH > 0 && sumProbsMarginFH < Infinity) {
                currentLineMarginTextFH = `Margin: ${((sumProbsMarginFH - 1) * 100).toFixed(2)}%`;
            }
        }

        if (apiOverSelectionFH || apiUnderSelectionFH || (isCurrentlyManual && (currentManualEventData[outcomeTypeOverFH] || currentManualEventData[outcomeTypeUnderFH]))) {
            lineSpecificHtmlFH += `<div class="market-title-container mt-3"><h4 class="market-title text-sm font-semibold">1H Total Goals ${line}</h4><span class="market-margin">${currentLineMarginTextFH}</span></div>`;
            lineSpecificHtmlFH += `<div class="odds-grid total-goals-options-grid mt-1">`;
            lineSpecificHtmlFH += createOddsSelectionHTML(`Over ${line}`, feedOverPriceFH, feedOverMaxStakeFH, feedOverProbabilityFH, eventKey, 'fh_total_goals', outcomeTypeOverFH, isCurrentlyManual, currentManualInputType, currentManualEventData, line);
            lineSpecificHtmlFH += createOddsSelectionHTML(`Under ${line}`, feedUnderPriceFH, feedUnderMaxStakeFH, feedUnderProbabilityFH, eventKey, 'fh_total_goals', outcomeTypeUnderFH, isCurrentlyManual, currentManualInputType, currentManualEventData, line);
            lineSpecificHtmlFH += `</div>`;
            fhTotalGoalsHtmlCombined += lineSpecificHtmlFH;
        }
    });

    if (!fhTotalGoalsHtmlCombined) {
        fhTotalGoalsHtmlCombined = '<p class="text-xs text-gray-500 mt-1">First Half Total Goals lines not available.</p>';
    }
    firstHalfTotalGoalsInfoElem.innerHTML = `<div class="market-title-container"><h3 class="market-title">Total Goals (1st Half)</h3></div>${fhTotalGoalsHtmlCombined}`;

    // Update Expected Goals Display
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
    attachChartIconListeners();
}
        
        function attachChartIconListeners() {
            document.querySelectorAll('.chart-icon').forEach(icon => {
                icon.removeEventListener('click', handleChartIconClick); 
                icon.addEventListener('click', handleChartIconClick);
            });
        }

        function handleChartIconClick(e) {
            const icon = e.currentTarget; 
            const eventName = icon.dataset.eventName;
            const marketNameLog = icon.dataset.marketNameLog;
            const outcomeNameLog = icon.dataset.outcomeNameLog;
            
            if (eventName && marketNameLog && outcomeNameLog && marketNameLog !== "N/A") { 
                renderOddsMovementChart(eventName, marketNameLog, outcomeNameLog);
            } else {
                console.warn("Chart icon clicked, but missing or invalid data attributes:", icon.dataset);
                 oddsChartContainer.classList.remove('hidden');
                 oddsMovementChartCanvas.classList.add('hidden');
                 chartNoDataMessage.classList.remove('hidden');
                 chartNoDataMessage.textContent = `Cannot generate chart due to missing market details.`;
                 oddsChartTitle.textContent = `Odds Chart`;
                 if (currentOddsChart) {
                    currentOddsChart.destroy();
                    currentOddsChart = null;
                }
            }
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

                const allOutcomeTypes = [
                    'home', 'draw', 'away', 'bttsYes', 'bttsNo',
                    'over05', 'under05', 'over075', 'under075', 'over1', 'under1', 'over125', 'under125', 
                    'over15', 'under15', 'over175', 'under175', 'over2', 'under2', 'over225', 'under225',
                    'over25', 'under25', 'over275', 'under275', 'over3', 'under3', 'over325', 'under325',
                    'over35', 'under35', 'over375', 'under375', 'over4', 'under4', 'over425', 'under425',
                    'over45', 'under45',
                    'over05FH', 'under05FH', 'over075FH', 'under075FH', 'over1FH', 'under1FH', 
                    'over125FH', 'under125FH', 'over15FH', 'under15FH'
                ];
                allOutcomeTypes.forEach(ocType => {
                    manualModeEvents[eventKey][ocType] = implied[ocType] !== "N/A" ? implied[ocType] : (manualModeEvents[eventKey][ocType] || "1.001");
                });

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

            const fairProbs = {}; 

            const deriveFairProbsTwoWay = (sel1, sel2) => {
                if (sel1?.price && sel2?.price && !isNaN(parseFloat(sel1.price)) && !isNaN(parseFloat(sel2.price)) && sel1.price > 0 && sel2.price > 0) {
                    const p1 = 1 / parseFloat(sel1.price);
                    const p2 = 1 / parseFloat(sel2.price);
                    const booksum = p1 + p2;
                    if (booksum > 0) {
                        return { prob1: p1 / booksum, prob2: p2 / booksum };
                    }
                }
                return null;
            };
            
            const deriveFairProbsThreeWay = (sel1, sel2, sel3) => {
                 if (sel1?.price && sel2?.price && sel3?.price && !isNaN(parseFloat(sel1.price)) && !isNaN(parseFloat(sel2.price)) && !isNaN(parseFloat(sel3.price)) && sel1.price > 0 && sel2.price > 0 && sel3.price > 0) {
                    const p1 = 1 / parseFloat(sel1.price);
                    const p2 = 1 / parseFloat(sel2.price);
                    const p3 = 1 / parseFloat(sel3.price);
                    const booksum = p1 + p2 + p3;
                    if (booksum > 0) {
                        return { prob1: p1 / booksum, prob2: p2 / booksum, prob3: p3 / booksum };
                    }
                }
                return null;
            };

            const moAPI = eventData.markets['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
            if (moAPI) {
                const moFair = deriveFairProbsThreeWay(moAPI.find(s=>s.outcome==='home'), moAPI.find(s=>s.outcome==='draw'), moAPI.find(s=>s.outcome==='away'));
                if(moFair) { fairProbs.home = moFair.prob1; fairProbs.draw = moFair.prob2; fairProbs.away = moFair.prob3; }
            }

            const bttsAPI = eventData.markets['soccer.both_teams_to_score']?.submarkets?.['period=ft']?.selections;
            if(bttsAPI) {
                const bttsFair = deriveFairProbsTwoWay(bttsAPI.find(s=>s.outcome==='yes'), bttsAPI.find(s=>s.outcome==='no'));
                if(bttsFair) { fairProbs.bttsYes = bttsFair.prob1; fairProbs.bttsNo = bttsFair.prob2;}
            }
            
            const ftTgAPI = eventData.markets['soccer.total_goals']?.submarkets?.['period=ft']?.selections;
            if (ftTgAPI) {
                ["0.5", "0.75", "1.0", "1.25", "1.5", "1.75", "2.0", "2.25", "2.5", "2.75", "3.0", "3.25", "3.5", "3.75", "4.0", "4.25", "4.5"].forEach(line => {
                    const overSel = ftTgAPI.find(s => s.params === `total=${line}` && s.outcome === "over");
                    const underSel = ftTgAPI.find(s => s.params === `total=${line}` && s.outcome === "under");
                    const tgFair = deriveFairProbsTwoWay(overSel, underSel);
                    if (tgFair) {
                        fairProbs[`over${line.replace('.', '')}`] = tgFair.prob1;
                        fairProbs[`under${line.replace('.', '')}`] = tgFair.prob2;
                    }
                });
            }

            const fhTgAPIMarkets = eventData.markets['soccer.total_goals_period_first_half']?.submarkets;
            if (fhTgAPIMarkets) {
                let fhSubmarketKeyToUse = null;
                if (fhTgAPIMarkets['period=1h']) fhSubmarketKeyToUse = 'period=1h';
                else if (fhTgAPIMarkets['period=fh']) fhSubmarketKeyToUse = 'period=fh';

                if (fhSubmarketKeyToUse && fhTgAPIMarkets[fhSubmarketKeyToUse]?.selections) {
                    const fhSelectionsAPI = fhTgAPIMarkets[fhSubmarketKeyToUse].selections;
                    ["0.5", "0.75", "1.0", "1.25", "1.5"].forEach(line => {
                        const overSelFH = fhSelectionsAPI.find(s => s.params === `total=${line}` && s.outcome === "over");
                        const underSelFH = fhSelectionsAPI.find(s => s.params === `total=${line}` && s.outcome === "under");
                        const fhTgFair = deriveFairProbsTwoWay(overSelFH, underSelFH);
                        if (fhTgFair) {
                            fairProbs[`over${line.replace('.', '')}FH`] = fhTgFair.prob1;
                            fairProbs[`under${line.replace('.', '')}FH`] = fhTgFair.prob2;
                        }
                    });
                }
            }
            
            const newOddsWithUserMargin = applyMarginToFairProbs(fairProbs, desiredMarginValue);
            manualModeEvents[eventKey].impliedOdds = newOddsWithUserMargin; 

            const allOutcomeTypes = [
                'home', 'draw', 'away', 'bttsYes', 'bttsNo',
                'over05', 'under05', 'over075', 'under075', 'over1', 'under1', 'over125', 'under125', 
                'over15', 'under15', 'over175', 'under175', 'over2', 'under2', 'over225', 'under225',
                'over25', 'under25', 'over275', 'under275', 'over3', 'under3', 'over325', 'under325',
                'over35', 'under35', 'over375', 'under375', 'over4', 'under4', 'over425', 'under425',
                'over45', 'under45',
                'over05FH', 'under05FH', 'over075FH', 'under075FH', 'over1FH', 'under1FH', 
                'over125FH', 'under125FH', 'over15FH', 'under15FH'
            ];
            allOutcomeTypes.forEach(ocType => {
                manualModeEvents[eventKey][ocType] = newOddsWithUserMargin[ocType] !== "N/A" ? newOddsWithUserMargin[ocType] : (manualModeEvents[eventKey][ocType] || "1.001");
            });
            
            if (manualModeEvents[eventKey].over25 && manualModeEvents[eventKey].under25 && manualModeEvents[eventKey].home && manualModeEvents[eventKey].away) {
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
                             if (manualModeEvents[eventKey].over25 && manualModeEvents[eventKey].under25 && manualModeEvents[eventKey].home && manualModeEvents[eventKey].away) {
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
                
                const outcomesToInit = {
                    home: null, draw: null, away: null, bttsYes: null, bttsNo: null,
                    over05: null, under05: null, over075: null, under075: null, over1: null, under1: null, over125: null, under125: null,
                    over15: null, under15: null, over175: null, under175: null, over2: null, under2: null, over225: null, under225: null,
                    over25: null, under25: null, over275: null, under275: null, over3: null, under3: null, over325: null, under325: null,
                    over35: null, under35: null, over375: null, under375: null, over4: null, under4: null, over425: null, under425: null,
                    over45: null, under45: null,
                    over05FH: null, under05FH: null, over075FH: null, under075FH: null, over1FH: null, under1FH: null,
                    over125FH: null, under125FH: null, over15FH: null, under15FH: null
                };

                if (eventData?.markets) {
                    const mo = eventData.markets['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
                    if(mo) { outcomesToInit.home = mo.find(s=>s.outcome==='home')?.price; outcomesToInit.draw = mo.find(s=>s.outcome==='draw')?.price; outcomesToInit.away = mo.find(s=>s.outcome==='away')?.price; }
                    
                    const btts = eventData.markets['soccer.both_teams_to_score']?.submarkets?.['period=ft']?.selections;
                    if(btts) { outcomesToInit.bttsYes = btts.find(s=>s.outcome==='yes')?.price; outcomesToInit.bttsNo = btts.find(s=>s.outcome==='no')?.price; }

                    const tg = eventData.markets['soccer.total_goals']?.submarkets?.['period=ft']?.selections;
                    if(tg) {
                        ["0.5", "0.75", "1.0", "1.25", "1.5", "1.75", "2.0", "2.25", "2.5", "2.75", "3.0", "3.25", "3.5", "3.75", "4.0", "4.25", "4.5"].forEach(line => {
                            outcomesToInit[`over${line.replace('.','')}`] = tg.find(s=>s.params===`total=${line}`&&s.outcome==="over")?.price;
                            outcomesToInit[`under${line.replace('.','')}`] = tg.find(s=>s.params===`total=${line}`&&s.outcome==="under")?.price;
                        });
                    }
                    const fhtgMarkets = eventData.markets['soccer.total_goals_period_first_half']?.submarkets;
                    if(fhtgMarkets) {
                        let fhSubmarketKeyToUse = null;
                        if (fhtgMarkets['period=1h']) fhSubmarketKeyToUse = 'period=1h';
                        else if (fhtgMarkets['period=fh']) fhSubmarketKeyToUse = 'period=fh';
                        
                        if (fhSubmarketKeyToUse && fhtgMarkets[fhSubmarketKeyToUse]?.selections) {
                            const fhtgSels = fhtgMarkets[fhSubmarketKeyToUse].selections;
                            ["0.5", "0.75", "1.0", "1.25", "1.5"].forEach(line => {
                                 outcomesToInit[`over${line.replace('.','')}FH`] = fhtgSels.find(s=>s.params===`total=${line}`&&s.outcome==="over")?.price;
                                 outcomesToInit[`under${line.replace('.','')}FH`] = fhtgSels.find(s=>s.params===`total=${line}`&&s.outcome==="under")?.price;
                            });
                        }
                    }
                }
                for (const key in outcomesToInit) {
                    manualModeEvents[eventKey][key] = parseFloat(outcomesToInit[key] || 1.001).toFixed(3);
                }
                
                let initialSupremacy = 0, initialExpectancy = 2.5; 
                if (manualModeEvents[eventKey].over25 && manualModeEvents[eventKey].under25 && manualModeEvents[eventKey].home && manualModeEvents[eventKey].away) {
                    const xgResult = calculateExpectedGoalsFromPrices(
                        parseFloat(manualModeEvents[eventKey].over25), parseFloat(manualModeEvents[eventKey].under25),
                        parseFloat(manualModeEvents[eventKey].home), parseFloat(manualModeEvents[eventKey].away)
                    );
                    if (xgResult) { initialSupremacy = xgResult.supremacy; initialExpectancy = xgResult.totalExpectedGoals;}
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
