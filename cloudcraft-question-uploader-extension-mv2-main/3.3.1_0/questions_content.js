var graphqlURL = "https://prod-api.acloud.guru/bff/graphql";

var allowedQuestionKeys = [
  "id",
  "poolId",
  "questionText",
  "type",
  "tags",
  "bloomsTaxonomy",
  "difficulty",
  "domain",
  "choices",
];

function getQuestionPoolQuery(poolId) {
  return {
    query: `
query getQuestionPoolById($id: String) {
  questionPool(id: $id) {
    id
    name
    questions {
      id
      poolId
      questionText
      type
      tags
      choices {
        id
        text
        explanation
        correctAnswer
      }
    }
  }
}`,
    variables: { id: poolId },
  };
}

function saveQuestionPoolMutation(questions, questionPoolName, questionPoolId) {
  return {
    query: `
mutation saveQuestionPool($input: AssessmentsContentQuestionPoolInput!) {
  saveQuestionPool(input: $input) {
    id
    name
    createdBy
    questions {
      id
      poolId
      questionText
      type
      tags
      bloomsTaxonomy
      difficulty
      domain
      choices {
        id
        text
        explanation
        correctAnswer
        __typename
      }
      __typename
    }
    __typename
  }
}`,
    variables: {
      input: {
        id: questionPoolId || null,
        name: questionPoolName,
        questions: questions.map((question) =>
          formatQuestion(question, questionPoolId)
        ),
      },
    },
  };
}

function saveQuestionMutation(question, questionPoolId) {
  return {
    query: `
mutation saveQuestion($input: AssessmentsContentQuestionInput!) {
  saveQuestion(input: $input) {
    id
    __typename
  }
}`,
    variables: {
      input: formatQuestion(question, questionPoolId),
    },
  };
}

function executeGraphQL(query) {
  return fetch(graphqlURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      /*
      Authorization: `Bearer ${localStorage.access_token}`,
      */
      // Get bearer token from Cookie storage
      Authorization: `Bearer ${document.cookie.split(";").map((cookie) => cookie.split("=")).reduce((accumulator, [key, value]) => ({...accumulator,[key.trim()]: decodeURIComponent(value),}),{}).auth0_token}`
    },
    body: JSON.stringify(query),
  });
}

function questionFromQuestionResponse(question, stripIds = false) {
  var videoName;

  let choices = question.choices.map((choice) => {
    var explanation;
    let videoRegex = /\n\nVideo for reference: (.*)/;

    if (choice.explanation) {
      let videoNameIndex = choice.explanation.search(videoRegex);
      if (videoNameIndex >= 0) {
        videoName = videoRegex.exec(choice.explanation)[1];
        explanation = choice.explanation.substring(0, videoNameIndex);
      } else {
        explanation = choice.explanation;
      }
    } else {
      explanation = "";
    }

    let final = {
      text: choice.text,
      correctAnswer: choice.correctAnswer,
      explanation: explanation,
    }

    return stripIds ? final : {
      id: choice.id,
      ...final
    };
  });

  let final = {
    questionText: question.questionText,
    tags: question.tags,
    choices: choices,
  }

  return stripIds ? final : {
    id: question.id,
    uploaded: true,
    ...final
  };
}

function formatQuestion(question, poolId) {
  let answerType =
    question.choices.reduce((count, choice) => {
      return choice.correctAnswer ? count + 1 : count;
    }, 0) === 1
      ? "single-answer"
      : "multi-answer";

  question.questionText = String(question.questionText);

  question.choices = question.choices.map((choice) => {
    choice.id = choice.id || null;
    choice.text = String(choice.text);
    choice.explanation = String(choice.explanation);
    if (question.videoName) {
      choice.explanation =
        choice.explanation.trim() +
        `\n\nVideo for reference: ${question.videoName}`;
    }
    return choice;
  });

  let formattedQuestion = Object.assign({ id: null }, question, {
    type: answerType,
    poolId: poolId || null,
  });

  for (const key of Object.keys(formattedQuestion)) {
    if (!allowedQuestionKeys.includes(key)) {
      delete formattedQuestion[key];
    }
  }

  return formattedQuestion;
}

async function exportQuestions(request) {
  var poolId = request.questionPoolId,
    questions,
    poolError;

  let query = getQuestionPoolQuery(poolId);

  await executeGraphQL(query)
    .then((r) => r.json())
    .then(({ errors, data: { questionPool: questionPool } }) => {
      poolError = errors;
      questions = questionPool.questions.map((question) =>
        questionFromQuestionResponse(question, request.stripIds)
      );
    });

  if (poolError) {
    return {
      poolError: poolError,
    };
  }

  return {
    questions,
  };
}

async function createQuestionPoolAndQuestions(request) {
  var questions = request.questions || [],
    questionsSkipped = [],
    questionsUpdated = [],
    questionsCreated = [],
    questionsFailed = [],
    questionPoolName = request.questionPoolName,
    questionPoolId = request.questionPoolId;

  questionsSkipped = questions.filter((question) => question.uploaded === true);

  var port = chrome.runtime.connect({ name: "cc-uploader" });

  if (!questionPoolId && questionPoolName) {
    let createQuestionPool = saveQuestionPoolMutation(
      [],
      questionPoolName,
      questionPoolId
    );

    await executeGraphQL(createQuestionPool)
      .then((r) => r.json())
      .then(({ data: { saveQuestionPool: poolInfo } }) => {
        questionPoolId = poolInfo.id;
      });
  }

  let nonSkippedQuestions = questions.filter(
    (question) => question.uploaded !== true
  );

  await Promise.all(
    nonSkippedQuestions.map(async (question) => {
      let query = saveQuestionMutation(question, questionPoolId);
      let response = await executeGraphQL(query)
        .then((r) => r.json())
        .then(({ errors, data: { saveQuestion: _poolInfo } }) => {
          if (errors) {
            questionsFailed.push(errors);
          } else if (question.id) {
            questionsUpdated.push(question.id);
          } else {
            questionsCreated.push(question);
          }

          port.postMessage({
            totalRequests: nonSkippedQuestions.length,
            completedRequests:
              questionsFailed.length +
              questionsCreated.length +
              questionsUpdated.length,
          });
        });

      return response;
    })
  );

  return {
    questionsCreated: questionsCreated,
    questionsSkipped: questionsSkipped,
    questionsUpdated: questionsUpdated,
    questionPoolId: questionPoolId,
  };
}

var QUESTION_HANDLER_REGISTERED;

console.log("LA-CC-UPLOADER - Loading content script");
console.log(
  `LA-CC-UPLOADER - QUESTION_HANDLER_REGISTERED = ${QUESTION_HANDLER_REGISTERED}`
);

if (!QUESTION_HANDLER_REGISTERED) {
  console.log("LA-CC-UPLOADER - Registering onMessage Handler");
  chrome.runtime.onMessage.addListener(function (
    request,
    _sender,
    sendResponse
  ) {
    if (request.export === true) {
      console.log("LA-CC-UPLOADER - Exporting Questions");
      exportQuestions(request).then(sendResponse);
    } else {
      console.log("LA-CC-UPLOADER - Creating/Updating Questions");
      createQuestionPoolAndQuestions(request).then(sendResponse);
    }
    return true;
  });

  QUESTION_HANDLER_REGISTERED = true;
}
