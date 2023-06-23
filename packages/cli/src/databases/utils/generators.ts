import humanId from 'human-id';

export const generateId = () => humanId({ capitalize: false, separator: '-' }); //nanoid();
