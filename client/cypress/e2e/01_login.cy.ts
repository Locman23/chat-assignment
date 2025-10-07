describe('Login', () => {
  it('logs in as super user and reaches dashboard', () => {
    cy.visit('/login');
    cy.get('[data-cy=login-username]').type('super');
    cy.get('[data-cy=login-password]').type('123');
    cy.get('[data-cy=login-submit]').click();
    cy.url().should('include', '/dashboard');
    cy.contains('Dashboard').should('be.visible');
  });
});
