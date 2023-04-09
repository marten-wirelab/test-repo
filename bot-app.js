/**
 * @param {import('probot').Probot} app
 */
const { Configuration, OpenAIApi } = require("openai");
const { createPullRequest } = require("octokit-plugin-create-pull-request");


const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const extensions = {
  '.js': ['JavaScript', t => `//${t}`],
  '.ts': ['TypeScript', t => `//${t}`],
  '.css': ['CSS', t => `/*${t}*/`],
  '.scss': ['SCSS', t => `/*${t}*/`],
  '.less': ['LESS', t => `/*${t}*/`],
  '.py': ['Python', t => `#${t}`],
  '.php': ['PHP', t => `//${t}`],
}

module.exports = (app) => {
  app.log("Yay! The app was loaded!");
  const openai = new OpenAIApi(configuration);


  app.on("push", async (context) => {
    const { payload } = context;
    const branch = payload.ref.replace("refs/heads/", "");
    if (branch === "wl-commentbot") return;
    const files = Object.keys(payload.commits.reduce((acc, commit) => {
      commit.added.forEach((file) => acc[file] = true);
      commit.modified.forEach((file) => acc[file] = true);
      return acc
    }, {}));
    //app.log(files);
    const changed = Object.assign({}, ...await Promise.all(files.map(async (file) => {
      const extension = file.toLowerCase().match(/\.([a-z0-9]+)$/);
      const langInfo = extension ? extensions[extension[0]] : null;

      if (!langInfo) { };

      const rsp = await context.octokit.repos.getContent({
        owner: payload.repository.owner.name,
        repo: payload.repository.name,
        path: file,
        ref: payload.head_commit.id
      });
      const content = Buffer.from(rsp.data.content, 'base64').toString();

      const [name, comment] = langInfo;
      try {
        const response = await openai.createEdit({
          model: "code-davinci-edit-001",
          input: content,
          instruction: `This is a ${name} file called ${file}, from a repository called ${payload.repository.name}. ` +
            `Please add any inline documentation you think is necessary to make this code more readable.`,
          temperature: 0.5,
        });
        const rsp = response.data;
        //const rsp = {
        //  object: 'edit',
        //  created: 1681069650,
        //  choices: [
        //    {
        //      text: '/**\n' +
        //        ' * this is a main function\n' +
        //        ' */\n' +
        //        'function main(){\n' +
        //        '  // this is a main function\n' +
        //        '  console.log("test")\n' +
        //        '  \n' +
        //        '}\n',
        //      index: 0
        //    }
        //  ],
        //  usage: { prompt_tokens: 50, completion_tokens: 43, total_tokens: 93 }
        //}
        const newContent = rsp.choices[0].text
        if (newContent === content) return {};
        return { [file]: newContent }
      } catch (e) {
        console.error(e.response.status, e.response.data)
      }
      return {};
    })))

    if (Object.keys(changed).length === 0) return;

    const myOctokit = createPullRequest(context.octokit);

    const pr = await myOctokit.createPullRequest({
      owner: payload.repository.owner.name,
      repo: payload.repository.name,
      title: "Inline documentation",
      body: "I added some documentation for you to enjoy :)",
      head: "wl-commentbot",
      base: branch,
      update: true /* optional: set to `true` to enable updating existing pull requests */,
      forceFork: false /* optional: force creating fork even when user has write rights */,
      changes: [
        {
          /* optional: if `files` is not passed, an empty commit is created instead */
          files: changed,
          commit:
            "Added inline documentation",
          /* optional: if not passed, will be the authenticated user and the current date */
          author: {
            name: "WL-DocBot",
            email: "docbot@wirelab.nl",
            date: new Date().toISOString(), // must be ISO date string
          },
          /* optional: if not passed, will use the information set in author */
          committer: {
            name: "WL-DocBot",
            email: "docbot@wirelab.nl",
            date: new Date().toISOString(), // must be ISO date string
          },
        },
      ],
    })
    console.log(`Created PR: ${pr.url}`)
  })
};
