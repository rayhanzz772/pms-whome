'use strict';
const cuid = require('cuid');
const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    await queryInterface.bulkInsert('users', [
      {
        id: cuid(),
        username: 'john_doe',
        email: 'john@example.com',
        password: hashedPassword,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down (queryInterface, Sequelize) {
     await queryInterface.bulkDelete('users', null, {});
  }
};
