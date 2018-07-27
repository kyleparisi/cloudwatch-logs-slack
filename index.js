const zlib = require("zlib");
const https = require("https");

function postToSlack(logTitle, logMessage, context) {
  const slackPostPath = process.env["SLACK_POST_PATH_" + context.alias];
  const slackBotUsername = process.env.SLACK_BOT_USERNAME + " " + context.alias;
  const slackBotIconEmoji = process.env.SLACK_BOT_EMOJI;

  const payloadStr = JSON.stringify({
    username: slackBotUsername,
    attachments: [
      {
        title: logTitle,
        title_link: context.cloudwatchUrl,
        fallback: logMessage,
        text: logMessage,
        color: "f58410"
      }
    ],
    icon_emoji: slackBotIconEmoji
  });

  const options = {
    hostname: "hooks.slack.com",
    port: 443,
    path: slackPostPath,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payloadStr)
    }
  };

  const postReq = https.request(options, function(res) {
    res.on("end", function() {

      if (res.statusCode < 400) {
        console.info("Message posted successfully");
      } else if (res.statusCode < 500) {
        console.error(
          "Error posting message to Slack API: " +
            res.statusCode +
            " - " +
            res.statusMessage
        );
      } else {
        console.error(
          "Server error when processing message: " +
            res.statusCode +
            " - " +
            res.statusMessage
        );
      }

      context.succeed("DONE");
    });
    return res;
  });

  postReq.write(payloadStr);
  postReq.end();
}

function isNumber(input) {
  return !isNaN(input);
}

function isNotAnAliasName(context) {
  return isNumber(context.alias) || context.functionName === context.alias;
}

exports.handler = (event, context) => {
  const payload = new Buffer(event.awslogs.data, "base64");
  const parsed = JSON.parse(zlib.gunzipSync(payload).toString("utf8"));
  console.log("Decoded payload:", JSON.stringify(parsed));
  context.alias = context.invokedFunctionArn.split(":").slice(-1)[0];
  console.log("Alias: " + context.alias);
  if (isNotAnAliasName(context)) {
    context.alias = "UAT";
  }
  const messages = [];
  parsed.logEvents.map(log => messages.push(log.message));
  const firstMessageTimestamp = parsed.logEvents[0].timestamp;
  const firstMessageDate = new Date(firstMessageTimestamp);
  const start = firstMessageDate.toISOString();
  const timeWindow = new Date(firstMessageDate.getTime());
  timeWindow.setMinutes(timeWindow.getMinutes() + 1);
  const end = timeWindow.toISOString();
  const cloudwatchUrl = `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logEventViewer:group=${
    parsed.logGroup
  };stream=${parsed.logStream};start=${start};end=${end}`;
  console.log(cloudwatchUrl);
  context.cloudwatchUrl = cloudwatchUrl;
  postToSlack(parsed.logStream, messages.join("\n"), context);
  return `Successfully processed ${parsed.logEvents.length} log events.`;
};
