import * as Db from '@/Db';
import config from '@/config';
import { audit } from '@/audit';
import { CREDENTIALS_REPORT } from '@/audit/constants';
import { generateNanoId } from '@db/utils/generators';
import { createNode, createWorkflowDetails, getRiskSection } from './utils';
import * as testDb from '../shared/testDb';

beforeAll(async () => {
	await testDb.init();
});

beforeEach(async () => {
	await testDb.truncate(['Workflow', 'Credentials', 'Execution']);
});

afterAll(async () => {
	await testDb.terminate();
});

test('should report credentials not in any use', async () => {
	const credentialDetails = {
		id: generateNanoId(),
		name: 'My Slack Credential',
		data: 'U2FsdGVkX18WjITBG4IDqrGB1xE/uzVNjtwDAG3lP7E=',
		type: 'slackApi',
		nodesAccess: [{ nodeType: 'n8n-nodes-base.slack', date: '2022-12-21T11:23:00.561Z' }],
	};

	const workflowDetails = createWorkflowDetails([createNode('n8n-nodes-base.slack', 'My Node')]);

	await Promise.all([
		Db.collections.Credentials.save(credentialDetails),
		Db.collections.Workflow.save(workflowDetails),
	]);

	const testAudit = await audit(['credentials']);

	const section = getRiskSection(
		testAudit,
		CREDENTIALS_REPORT.RISK,
		CREDENTIALS_REPORT.SECTIONS.CREDS_NOT_IN_ANY_USE,
	);

	expect(section.location).toHaveLength(1);
	expect(section.location[0]).toMatchObject({
		id: credentialDetails.id,
		name: 'My Slack Credential',
	});
});

test('should report credentials not in active use', async () => {
	const credentialDetails = {
		id: generateNanoId(),
		name: 'My Slack Credential',
		data: 'U2FsdGVkX18WjITBG4IDqrGB1xE/uzVNjtwDAG3lP7E=',
		type: 'slackApi',
		nodesAccess: [{ nodeType: 'n8n-nodes-base.slack', date: '2022-12-21T11:23:00.561Z' }],
	};

	const credential = await Db.collections.Credentials.save(credentialDetails);

	const workflowDetails = createWorkflowDetails([createNode('n8n-nodes-base.slack', 'My Node')]);

	await Db.collections.Workflow.save(workflowDetails);

	const testAudit = await audit(['credentials']);

	const section = getRiskSection(
		testAudit,
		CREDENTIALS_REPORT.RISK,
		CREDENTIALS_REPORT.SECTIONS.CREDS_NOT_IN_ACTIVE_USE,
	);

	expect(section.location).toHaveLength(1);
	expect(section.location[0]).toMatchObject({
		id: credential.id,
		name: 'My Slack Credential',
	});
});

test('should report credential in not recently executed workflow', async () => {
	const credentialDetails = {
		id: generateNanoId(),
		name: 'My Slack Credential',
		data: 'U2FsdGVkX18WjITBG4IDqrGB1xE/uzVNjtwDAG3lP7E=',
		type: 'slackApi',
		nodesAccess: [{ nodeType: 'n8n-nodes-base.slack', date: '2022-12-21T11:23:00.561Z' }],
	};

	const credential = await Db.collections.Credentials.save(credentialDetails);

	const workflowDetails = createWorkflowDetails([
		createNode(
			'n8n-nodes-base.slack',
			'My Node',
			undefined,
			{},
			{
				slackApi: {
					id: credential.id,
					name: credential.name,
				},
			},
		),
	]);

	const workflow = await Db.collections.Workflow.save(workflowDetails);

	const date = new Date();
	date.setDate(date.getDate() - config.getEnv('security.audit.daysAbandonedWorkflow') - 1);

	const savedExecution = await Db.collections.Execution.save({
		finished: true,
		mode: 'manual',
		startedAt: date,
		stoppedAt: date,
		workflowId: workflow.id,
		waitTill: null,
	});
	await Db.collections.ExecutionData.save({
		execution: savedExecution,
		data: '[]',
		workflowData: workflow,
	});

	const testAudit = await audit(['credentials']);

	const section = getRiskSection(
		testAudit,
		CREDENTIALS_REPORT.RISK,
		CREDENTIALS_REPORT.SECTIONS.CREDS_NOT_RECENTLY_EXECUTED,
	);

	expect(section.location).toHaveLength(1);
	expect(section.location[0]).toMatchObject({
		id: credential.id,
		name: credential.name,
	});
});

test('should not report credentials in recently executed workflow', async () => {
	const credentialDetails = {
		id: generateNanoId(),
		name: 'My Slack Credential',
		data: 'U2FsdGVkX18WjITBG4IDqrGB1xE/uzVNjtwDAG3lP7E=',
		type: 'slackApi',
		nodesAccess: [{ nodeType: 'n8n-nodes-base.slack', date: '2022-12-21T11:23:00.561Z' }],
	};

	const credential = await Db.collections.Credentials.save(credentialDetails);

	const workflowDetails = createWorkflowDetails(
		[
			createNode(
				'n8n-nodes-base.slack',
				'My Node',
				undefined,
				{},
				{
					slackApi: {
						id: credential.id,
						name: credential.name,
					},
				},
			),
		],
		true,
	);

	const workflow = await Db.collections.Workflow.save(workflowDetails);

	const date = new Date();
	date.setDate(date.getDate() - config.getEnv('security.audit.daysAbandonedWorkflow') + 1);

	const savedExecution = await Db.collections.Execution.save({
		finished: true,
		mode: 'manual',
		startedAt: date,
		stoppedAt: date,
		workflowId: workflow.id,
		waitTill: null,
	});

	await Db.collections.ExecutionData.save({
		execution: savedExecution,
		data: '[]',
		workflowData: workflow,
	});

	const testAudit = await audit(['credentials']);

	expect(testAudit).toBeEmptyArray();
});
