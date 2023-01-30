function sanitizeField(field) {
  if (field) {
    field = String(field)
    field = field.replace(/(\r\n|\n|\r|\s+|\t|&nbsp;)/gm, ' ')
    if (field.includes('"')) {
      field = field.replace(/"/g, '""')
      field = '"' + field + '"'
    } else if (field.includes(',')) {
      field = '"' + field + '"'
    }
    return field
  } else {
    return ''
  }
}

function convertCSV(questions) {
  var outputRows = [],
      columns,
      maxChoiceNumber = 0,
      maxTags = 0,
      choiceKeys;

  // calculate columns
  questions.map((question) => {
    if (question.choices.length > maxChoiceNumber) {
      maxChoiceNumber = question.choices.length
    }
    if (question.tags.length > maxTags) {
      maxTags = question.tags.length
    }
  })

  columns = Object.keys(questions[0])
  columns.pop("choices")
  columns.pop("tags")
  columns.pop("uploaded")
  choiceKeys = Object.keys(questions[0].choices[0])

  for (let index = 0; index < maxTags; index++) {
    columns.push(`tags/${index}`)
  }

  for (let index = 0; index < maxChoiceNumber; index++) {
    columns = columns.concat(choiceKeys.map((field) => `choices/${index}/${field}`))
  }

  // outputRows is an array of arrays
  outputRows.push(columns)

  for (const question of questions) {
    var row
    let tags = question.tags
    let choices = question.choices
    delete question.tags
    delete question.choices
    delete question.uploaded

    // Pad tags to maintain the proper number of columns
    while (tags.length < maxTags) {
      tags.push(null)
    }

    row = Object.values(question).map(sanitizeField)

    for (const tag of tags) {
      row.push(sanitizeField(tag))
    }

    for (const choice of choices) {
      row = row.concat(Object.values(choice).map(sanitizeField))
    }

    // Pad out extra columns
    while (row.length < columns.length) {
      row.push('')
    }

    outputRows.push(row)
  }

  return outputRows.map((row) => row.join(',')).join("\r\n")
}

document.addEventListener(
  "DOMContentLoaded",
  function () {
    console.log("loaded questions_popup.js");
    chrome.tabs.executeScript(null, { file: "questions_content.js" });

    var button = document.getElementById("populateQuestions"),
      downloadButton = document.getElementById("downloadQuestions"),
      failedArea = document.getElementById("failed"),
      skippedArea = document.getElementById("skipped"),
      createdArea = document.getElementById("created"),
      updatedArea = document.getElementById("updated"),
      yamlField = document.getElementById("questionsYaml"),
      newPoolTab = document.getElementById("newPoolTab"),
      newPoolField = document.getElementById("new-pool"),
      existingPoolTab = document.getElementById("existingPoolTab"),
      existingPoolField = document.getElementById("existing-pool"),
      exportPoolTab = document.getElementById("exportPoolTab"),
      poolIdField = document.getElementById("questionPoolId"),
      poolNameField = document.getElementById("questionPoolName"),
      downloadPoolField = document.getElementById("downloadPoolId"),
      stripIdsField = document.getElementById("stripIds"),
      exportFormatField = document.getElementById("exportFormat"),
      exporterPage = document.getElementById("exporter-page"),
      uploaderPage = document.getElementById("uploader-page"),
      progressField = document.getElementById("progress-field"),
      progressBar = document.getElementById("progress-bar"),
      questionPoolLink = document.getElementById("question-pool-link");

    function setPoolId(field) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        let poolId = tabs[0].url.split("question-pools/")[1];
        field.value = poolId || "";
      });
    }

    function renderPoolLink(questionPoolId) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs[0].url.includes(`question-pools/${questionPoolId}`)) {
          questionPoolLink.classList.remove("is-hidden");

          questionPoolLink.addEventListener("click", function () {
            chrome.tabs.update(tabs[0].id, {
              // Update URL
              url: `https://cloudcraft.acloud.guru/assessments/assessment-question-pools/${questionPoolId}`,
            });
            window.close();
          });
        } else {
          chrome.tabs.update(tabs[0].id, {
            // Update URL
            url: `https://cloudcraft.acloud.guru/assessments/assessment-question-pools/${questionPoolId}`,
          });
        }
      });
    }

    newPoolTab.addEventListener("click", function () {
      poolIdField.value = "";
      existingPoolField.classList.add("is-hidden");
      newPoolField.classList.remove("is-hidden");
      newPoolTab.classList.add("is-active");
      existingPoolTab.classList.remove("is-active");
      exportPoolTab.classList.remove("is-active");
      uploaderPage.classList.remove("is-hidden");
      exporterPage.classList.add("is-hidden");
      button.innerText = "Create Question Pool";
    });

    existingPoolTab.addEventListener("click", function () {
      setPoolId(poolIdField);
      poolNameField.value = "";
      newPoolField.classList.add("is-hidden");
      existingPoolField.classList.remove("is-hidden");
      newPoolTab.classList.remove("is-active");
      existingPoolTab.classList.add("is-active");
      exportPoolTab.classList.remove("is-active");
      uploaderPage.classList.remove("is-hidden");
      exporterPage.classList.add("is-hidden");
      button.innerText = "Update Question Pool";
    });

    exportPoolTab.addEventListener("click", function () {
      setPoolId(downloadPoolField);
      newPoolTab.classList.remove("is-active");
      existingPoolTab.classList.remove("is-active");
      exportPoolTab.classList.add("is-active");
      uploaderPage.classList.add("is-hidden");
      exporterPage.classList.remove("is-hidden");
    });

    downloadButton.addEventListener("click", function () {
      downloadButton.disabled = true;
      failedArea.innerText = "";
      failedArea.classList.add("is-hidden");
      skippedArea.innerText = "";
      skippedArea.classList.add("is-hidden");
      createdArea.innerText = "";
      createdArea.classList.add("is-hidden");
      updatedArea.innerText = "";
      updatedArea.classList.add("is-hidden");

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            export: true,
            stripIds: stripIdsField.checked,
            questionPoolId: downloadPoolField.value,
          },
          {},
          function (response) {
            console.table(response);

            if (!response) {
              console.log("No response");
              return;
            }

            if (response.poolErr) {
              failedArea.innerText = `Failed to fetch question pool: ${poolName}`;
              failedArea.classList.remove("is-hidden");

              downloadButton.disabled = false;
              return;
            }

            var questionsOutput;

            if (exportFormatField.value === "yaml") {
              try {
                questionsOutput = jsyaml.dump(response.questions);
              } catch (error) {
                failedArea.innerText = `Failed to dump YAML. Error:
              ${error}
            `;
                failedArea.classList.remove("is-hidden");
                downloadButton.disabled = false;
                return;
              }
            } else {
              // Convert Objects to CSV
              questionsOutput = convertCSV(response.questions)
            }

            var blob = new Blob([questionsOutput], { type: `text/${exportFormatField.value}` });

            // Create URL for document and trigger download
            var elem = window.document.createElement("a");
            elem.href = window.URL.createObjectURL(blob);
            if (exportFormatField.value === "yaml") {
              elem.download = `${downloadPoolField.value}.yml`;
            } else {
              elem.download = `${downloadPoolField.value}.csv`;
            }
            document.body.appendChild(elem);
            elem.click();
            document.body.removeChild(elem);
            window.URL.revokeObjectURL(blob);

            downloadButton.disabled = false;
          }
        );
      });
    });

    function updateProgress(completed, total) {
      progressField.classList.remove("is-hidden");
      progressBar.value = (completed / total) * 100;
      progressBar.innerText = `${completed / total}%`;
    }

    function clearProgress() {
      progressBar.value = 0;
      progressBar.innerText = "0%";
      progressField.classList.add("is-hidden");
    }

    button.addEventListener(
      "click",
      function () {
        button.disabled = true;
        failedArea.innerText = "";
        failedArea.classList.add("is-hidden");
        skippedArea.innerText = "";
        skippedArea.classList.add("is-hidden");
        createdArea.innerText = "";
        createdArea.classList.add("is-hidden");
        updatedArea.innerText = "";
        updatedArea.classList.add("is-hidden");

        var questions;

        try {
          questions = jsyaml.load(yamlField.value);
        } catch (error) {
          failedArea.innerText = `Failed to parse YAML. Error:
      ${error}
      `;
          failedArea.classList.remove("is-hidden");
          button.disabled = false;
          return;
        }

        // Display progress bar when button is clicked
        updateProgress(0, 1);

        console.table(questions);

        // Handle long running messages sent back from content script
        chrome.runtime.onConnect.addListener(function (port) {
          console.assert(port.name == "cc-uploader");
          port.onMessage.addListener(function (msg) {
            if (msg.totalRequests) {
              console.log("updating progress");
              console.table(msg);
              updateProgress(msg.completedRequests, msg.totalRequests);
            }
          });
        });

        chrome.tabs.query({ active: true, currentWindow: true }, function (
          tabs
        ) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              questions: questions,
              questionPoolName: poolNameField.value,
              questionPoolId: poolIdField.value,
            },
            {},
            function (response) {
              console.table(response);

              if (!response) {
                failedArea.innerText =
                  "Unable to make requests. Please close all CC tabs/windows and try again.";
                failedArea.classList.remove("is-hidden");

                button.disabled = false;
                clearProgress();
                return;
              }

              if (response.poolErr) {
                failedArea.innerText = `Failed to create question pool: ${poolName}`;
                failedArea.classList.remove("is-hidden");

                button.disabled = false;
                clearProgress();
                return;
              }

              let {
                questionsCreated,
                questionsUpdated,
                questionsSkipped,
                questionPoolId,
              } = { ...response };

              if (questionsCreated.length > 0) {
                createdArea.innerText = `Created ${questionsCreated.length} question(s)!`;
                createdArea.classList.remove("is-hidden");
              }

              if (questionsUpdated.length > 0) {
                updatedArea.innerText = `Updated ${questionsUpdated.length} question(s)!`;
                updatedArea.classList.remove("is-hidden");
              }

              if (response.questionsSkipped.length > 0) {
                skippedArea.innerText = `Skipped ${questionsSkipped.length} question(s)!`;
                skippedArea.classList.remove("is-hidden");
              }

              renderPoolLink(questionPoolId);

              button.disabled = false;
              yamlField.value = "";
              poolNameField.value = "";
              clearProgress();
            }
          );
        });
      },
      false
    );
  },
  false
);
