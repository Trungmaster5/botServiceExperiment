/*-----------------------------------------------------------------------------
This template demonstrates how to use an IntentDialog with a LuisRecognizer to add
natural language support to a bot.
For a complete walkthrough of creating this type of bot see the article at
https://aka.ms/abs-node-luis
-----------------------------------------------------------------------------*/
"use strict";
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");
var githubClient = require('./github-client.js');
var path = require('path');

var useEmulator = (process.env.NODE_ENV == 'development');

var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    stateEndpoint: process.env['BotStateEndpoint'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});

var bot = new builder.UniversalBot(connector);
bot.localePath(path.join(__dirname, './locale'));

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v1/application?id=' + luisAppId + '&subscription-key=' + luisAPIKey;

// Main dialog with LUIS
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
/*
.matches('<yourIntent>')... See details at http://docs.botframework.com/builder/node/guides/understanding-natural-language/
*/
.onDefault((session) => {
    session.send('Sorry, I did not understand \'%s\'.', session.message.text);
});

bot.dialog('/', intents);

bot.dialog('search',[
  function (session, args, next) {
      console.log(args);
      const query= builder.EntityRecognizer.findEntity(args.intent.entities,'query');
      if (!query) {
          // No matching entity
          builder.Prompts.text(session, 'Who did you want to search for?');
      } else {
          //the user typed in: search <<name>>
          next({ response: query.entity });
      }
  },
  function (session, results, next) {
      var query = results.response;
      if (!query) {
          session.endDialog('Request cancelled');
      } else {
          githubClient.executeSearch(query, function (profiles) {
              var totalCount = profiles.total_count;
              if (totalCount == 0) {
                  session.endDialog('Sorry, no results found.');
              } else if (totalCount > 10) {
                  session.endDialog('More than 10 results were found. Please provide a more restrictive query.');
              } else {
                  session.dialogData.property = null;
                  var usernames = profiles.items.map(function (item) { return item.login });

                  // TODO: Prompt user with list
                  builder.Prompts.choice(
                    session,
                    'Please choose user you are looking for',
                    usernames,
                    {listStyle: builder.ListStyle.button}
                  );
              }
          });
      }
  }, function(session, results, next) {
      // TODO: Display final request
      // When you're using choice, the value is inside of results.response.entity

      //E.g.session.endConversation(`You chose ${results.response.entity}`);
      session.sendTyping();
      githubClient.loadProfile(results.response.entity,
        function(profile){
          var card= new builder.HeroCard(session);

          card.title(profile.login);
          card.images([builder.CardImage.create(session,profile.avatar_url)]);
          if (profile.name) card.subtitle(profile.name);

          var text='';
          if (profile.company) text+= profile.company + '\n\n';
          if (profile.email) text+= profile.email + '\n\n';
          if (profile.bio) text+=profile.bio;
          card.text(text);
          card.tap(new builder.CardAction.openUrl(session,profile.html_url));

          var message= new builder.Message(session).attachments([card]);
          session.send(message);
        });
  }
]).triggerAction({
  matches:'SearchPromp'
});


if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function() {
        console.log('test bot endpont at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());
} else {
    module.exports = { default: connector.listen() }
}
