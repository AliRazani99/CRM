"""Regression tests for customer field persistence and optional sale CAD rate."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import Role
from inventory.models import Inventory
from parties.models import Customer, Warehouse
from parties.serializers import CustomerSerializer
from products.models import Brand, Category, Product
from sales.models import Sale, SaleItem


class CustomerFieldsTests(TestCase):
    def test_customer_email_and_birth_date_round_trip(self):
        serializer = CustomerSerializer(data={
            'full_name': 'Test Customer',
            'email': 'customer@example.com',
            'birth_date': '1998-07-15',
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        customer = serializer.save()
        self.assertEqual(customer.email, 'customer@example.com')
        self.assertEqual(customer.birth_date, date(1998, 7, 15))
        output = CustomerSerializer(customer).data
        self.assertEqual(output['email'], 'customer@example.com')
        self.assertEqual(output['birth_date'], '1998-07-15')


class SaleWithoutRateTests(APITestCase):
    def setUp(self):
        role, _ = Role.objects.get_or_create(
            code=Role.Code.SALES_MANAGER, defaults={'name': 'Sales Manager'}
        )
        self.user = get_user_model().objects.create_user(
            username='rate_tester', email='rate_tester@example.com',
            password='test-password-123', role=role,
        )
        self.client.force_authenticate(user=self.user)
        self.customer = Customer.objects.create(full_name='Buyer', phone='09120000000')
        self.warehouse = Warehouse.objects.create(name='Warehouse A')
        category = Category.objects.create(name='Category Rate Test')
        brand = Brand.objects.create(name='Brand Rate Test')
        self.product = Product.objects.create(
            category=category, brand=brand, name='Item', sku='RATE-NULL-TEST',
            sales_price_irr=Decimal('100.00'), default_cost_cad=Decimal('12.00'),
        )
        Inventory.objects.create(
            warehouse=self.warehouse, product=self.product,
            qty_on_hand=3, qty_reserved=0, avg_cost_cad=Decimal('12.00'),
        )

    def test_null_cad_rate_allows_sale_and_preserves_stock_and_cogs(self):
        response = self.client.post('/api/sales/sales/', {
            'customer': self.customer.pk,
            'sale_date': '2026-10-15',
            'items': [{
                'product': self.product.pk, 'warehouse': self.warehouse.pk,
                'quantity': 2, 'unit_price_irr': '100.00',
            }],
            'paid_amount': '0.00',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sale.objects.get(pk=response.data['id'])
        item = SaleItem.objects.get(sale=sale)
        self.assertIsNone(sale.cad_rate_irr_per_cad)
        self.assertIsNone(item.line_cogs_irr)
        self.assertEqual(item.line_cogs_cad, Decimal('24.00'))
        inventory = Inventory.objects.get(product=self.product, warehouse=self.warehouse)
        self.assertEqual(inventory.qty_on_hand, 1)
