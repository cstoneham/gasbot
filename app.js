const { App, AwsLambdaReceiver } = require('@slack/bolt');
const AWS = require('aws-sdk');
AWS.config.update({region:'us-west-2'}); // crash on local if this isn't set

const ddb = new AWS.DynamoDB.DocumentClient();

// Initialize your custom receiver
const awsLambdaReceiver = new AwsLambdaReceiver({
	signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Initializes your app with your bot token and app token
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
	receiver: awsLambdaReceiver,
	processBeforeResponse: true,
});

app.command('/prices', async ({ command, ack, respond }) => {
  await ack();

  await respond(`Still working on this feature. Contact <@U5LSGB3E2> for details.`);
});

app.action('subscribe', async ({ body, ack, say }) => {
  await ack();

	const threshold = body.actions[0].value;

  await say(`Thanks <@${body.user.id}>, we'll notify you when gas hits ${threshold}`);

	// Write this subscription to the DB
	await writeSubscription(body.team.id, body.user.id, body.channel.id, threshold)
});

app.command('/start', async ({ command, ack, respond }) => {
  await ack();

	const frequency = command.text;
	const enabled = true;
	const channelid = command.channel_id
	const teamid = command.team_id

	if (frequency < 1) {
		await respond('frequency must be > 1')

		return
	}

  await respond(`Starting feed every ${frequency} minutes`);

	// TODO: Write to DB (1) number of minutes (2) the teamid (3) channelid (4) status enabled/disabled
	await writeGasbotTeams(
		teamid,
		channelid,
		enabled,
		frequency,
	)
});


app.command('/alert', async ({ command, ack, respond }) => {
  await ack();

  await respond({
		text: `<@${command.user_id}>, you'll be notified when gas is below ${command.text}.`,
	});

	await app.client.chat.postMessage({
		channel: command.channel_id,
		blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `<@${command.user_id}> set an alert for when gas is below ${command.text}`
        },
      },
			{
				"type": "actions",
				"block_id": "actionblock789",
				"elements": [
					{
						"type": "button",
						"text": {
							"type": "plain_text",
							"text": "Subscribe to this alert"
						},
						"style": "primary",
						"value": command.text,
						"action_id": "subscribe",
					}
				]
			}
		]
	})
});

app.message('goodbye', async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say(`See ya later, <@${message.user}> :wave:`);
});

const writeGasbotTeams = async (teamid, channelid, enabled, frequency) => {
	const TableName = 'gasbotteams';

	const params = {
		TableName,
		Item: {
			teamid,
			channelid,
			enabled,
			frequency
		}
	};

	return ddb.put(params).promise();	
}

const writeSubscription = async (teamid, userid, channelid, threshold) => {
	const TableName = 'gasbot'

	const date = new Date();
	const epoch = date.getTime();

	// converting back to date-time
	const timestamp = new Date(epoch).getTime()

	// Get original list if any
	const originalRecord = await ddb.get({
    TableName,
    Key: {
			teamid,
		},
  }).promise();

	const isRecordExistant = originalRecord && originalRecord.Item && originalRecord.Item.subscribers;
	const databaseSubscribers = isRecordExistant ? originalRecord.Item.subscribers.values : [];

	databaseSubscribers.push(userid)

	const subscribers = Array.from((new Set(databaseSubscribers)).values())

	const params = {
		TableName,
		Item: {
				subscribers: ddb.createSet(subscribers),
				teamid,
				threshold,
				timestamp,
				channelid,
		}
	};

	return ddb.put(params).promise();
}

// Handle the Lambda function event
module.exports.handler = async (event, context, callback) => {
  const handler = await awsLambdaReceiver.start(3000);
  return handler(event, context, callback);
}