/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const luxon = require('luxon');

const REMINDER_TITLES = {
    TEN_MINTES_BEFORE: 'リモート会議10分前',
    ONE_MINUTES_BEFORE: 'リモート会議1分前'
}

const MESSAGES = {
    WELCOME: 'リモート会議のリマインダーです、会議の時間を指定してください',
    HELP: 'このスキルは会議の10分前と1分前にリマインダーを予約します、会議の時間を指定してください',
    STOP: 'さようなら',
    FALLBACK: "すみません、時刻をうまく聞き取れませんでした、もう一度お願いします",
    DENIED: "はい、もう一度時間を指定してください",
    NOTIFY_MISSING_PERMISSIONS: "アレクサアプリのホーム画面でリマインダーを有効にしてください",
    ERROR: '予期せぬエラーが発生しました',
    NO_VALUE: '時間を聞き取れませんでした、もう一度お願いします',
    REMINDER_SET: 'にリマインダーをセットしました',
    ONLY_ONE_MINTES_REMINDER_SET: 'の1分前にリマインダーをセットしました',
    NO_REMINDER_SET: '既にその時刻を過ぎています'
}

const ERROR_MESSAGES = {
    UNSUPPORTED_DEVICE: 'このデバイスはリマインダーに対応していません',
    STATUS_UNKNOWN: 'すみません、リマインダーの予約で予期せぬエラーが発生しました',
    NOTIFY_MISSING_PERMISSIONS: 'このスキルにリマインダーを作成する権限が許可されていないため、リマインダーを予約できませんでした、リマインダーを作成するために、スマートフォンのアレクサアプリのホーム画面で、リマインダーの権限を許可してください'
}

const PERMISSIONS = ['alexa::alerts:reminders:skill:readwrite'];

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        console.log("LaunchRequestHandler called")
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = MESSAGES.WELCOME;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const DateTimeHandler = {
    canHandle(handlerInput) {
        console.log("DateTimeHandler called")
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'DateTimeIntent';
    },
    async handle(handlerInput) {
        console.log("DateTimeHandler executed")
        const requestEnvelope = handlerInput.requestEnvelope;
        const responseBuilder = handlerInput.responseBuilder;
        const consentToken = requestEnvelope.context.System.apiAccessToken;

        // check for confirmation.  if not confirmed, delegate
        switch (requestEnvelope.request.intent.confirmationStatus) {
        case 'CONFIRMED':
            // intent is confirmed, so continue
            console.log('Alexa confirmed intent, so clear to create reminder');
            break;
        case 'DENIED':
            // intent was explicitly not confirmed, so skip creating the reminder
            console.log('Alexa disconfirmed the intent; not creating reminder');
            const speakOutput = MESSAGES.DENIED;
            return responseBuilder
                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        case 'NONE':
            default:
                return responseBuilder
                .addDelegateDirective()
                .getResponse();
        }

        const currentIntent = handlerInput.requestEnvelope.request.intent;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const upsServiceClient = handlerInput.serviceClientFactory.getUpsServiceClient();

        // get timezone
        const { deviceId } = handlerInput.requestEnvelope.context.System.device;
        const userTimezone = await upsServiceClient.getSystemTimeZone(deviceId);

        // get slots
        let date = currentIntent.slots.Date;
        const now = luxon.DateTime.local().setZone(userTimezone);
        const time = currentIntent.slots.Time;
        let dateLocal
        if (date.value) {
            dateLocal = luxon.DateTime.fromISO(date.value, { zone: userTimezone });
        } else {
            dateLocal = now.minus({ 'hours': now.hour, 'minute': now.minute });
        }

        // we have an appointment date and time
        if (time.value) {
            if (!consentToken) {
                const speakOutput = MESSAGES.NOTIFY_MISSING_PERMISSIONS;
                return responseBuilder
                    .speak(speakOutput)
                    .withAskForPermissionsConsentCard(PERMISSIONS)
                    .getResponse();
            }
            try {
                const client = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
                // format appointment date
                const timeLocal = luxon.DateTime.fromISO(time.value, { zone: userTimezone });
                const dateTimeLocal = dateLocal.plus({ 'hours': timeLocal.hour, 'minute': timeLocal.minute });
                const tenMinutesBefore = dateTimeLocal.minus({ 'minute': 10 });
                const oneMinutesBefore = dateTimeLocal.minus({ 'minute': 1 });
                const inputTenMinutesBefore = tenMinutesBefore.toFormat("yyyy-MM-dd'T'T:00");
                const inputOneMinutesBefore = oneMinutesBefore.toFormat("yyyy-MM-dd'T'T:00");

                let speakOutput = `${tenMinutesBefore.toFormat("yyyy'年'MM'月'd'日'、T")}と${oneMinutesBefore.toFormat("T")}${MESSAGES.REMINDER_SET}`;
                if (tenMinutesBefore > now) {
                    const reminderRequest = buildReminderRequest(inputTenMinutesBefore, REMINDER_TITLES.TEN_MINTES_BEFORE);
                    const reminderResponse = await client.createReminder(reminderRequest);
                } else {
                    speakOutput = `${oneMinutesBefore.toFormat("yyyy'年'MM'月'd'日'、T")}${MESSAGES.REMINDER_SET}`
                }
                if (oneMinutesBefore > now) {
                    const reminderRequest2 = buildReminderRequest(inputOneMinutesBefore, REMINDER_TITLES.ONE_MINUTES_BEFORE);
                    const reminderResponse2 = await client.createReminder(reminderRequest2);
                } else {
                    speakOutput = MESSAGES.NO_REMINDER_SET;
                }
                return responseBuilder.speak(speakOutput).getResponse();
            } catch (error) {
                throw error;
            }
        }
        return responseBuilder.speak(MESSAGES.NO_VALUE).getResponse();
    },
}

function buildReminderRequest(time, title) {
    return  {
        trigger: {
            "type" : "SCHEDULED_ABSOLUTE",
                    "scheduledTime" : time
            },
            alertInfo: {
                spokenInfo: {
                    content: [{
                        text: title,
                    }],
                },
            },
            pushNotification: {
                status: 'ENABLED',
            },
        };
}

const HelpIntentHandler = {
    canHandle(handlerInput) {
        console.log("HelpIntentHandler called")
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = MESSAGES.HELP;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        console.log("CancelAndStopIntentHandler called")
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = MESSAGES.STOP;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says 'exit' or 'quit'. 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        console.log("FallbackIntentHandler called")
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        console.log("FallbackIntentHandler executed")
        const speakOutput = MESSAGES.FALLBACK;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
  canHandle(handlerInput, error) {
    console.log("ErrorHandler called")
    return true;
  },
  handle(handlerInput, error) {
    console.log(`an error occured: ${error}`);
    console.log(`ERROR MESSAGE: ${error.message}`);
    if (error.name !== 'ServiceError') {
        return handlerInput.responseBuilder
          .speak(ERROR_MESSAGES.STATUS_UNKNOWN)
          .getResponse();
    }
    switch (error.statusCode) {
      case 401:
        return handlerInput.responseBuilder
          .speak(ERROR_MESSAGES.NOTIFY_MISSING_PERMISSIONS)
          .withAskForPermissionsConsentCard(PERMISSIONS)
          .getResponse();
      case 403:
        return handlerInput.responseBuilder
          .speak(ERROR_MESSAGES.UNSUPPORTED_DEVICE)
          .reprompt(ERROR_MESSAGES.UNSUPPORTED_DEVICE)
          .getResponse();
      default:
        return handlerInput.responseBuilder
          .speak(ERROR_MESSAGES.STATUS_UNKNOWN)
          .getResponse();
    }
  },
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        DateTimeHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler
        )
    .addErrorHandlers(ErrorHandler)
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();