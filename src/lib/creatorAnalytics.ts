
import { logger } from './logger.js';
import { db } from './db.js';

export interface PlatformMetrics {
  platform: string;
  totalRevenue: number;
  averageMonthly: number;
  transactionCount: number;
  lastPayment: Date | null;
  growthRate: number;
  reliability: 'high' | 'medium' | 'low';
}

export interface EquipmentDepreciation {
  id: string;
  item: string;
  originalCost: number;
  currentValue: number;
  monthlyDepreciation: number;
  remainingValue: number;
  businessUse: number;
  taxDeductible: number;
}

export interface SeasonalPattern {
  month: number;
  monthName: string;
  averageRevenue: number;
  variance: number;
  trend: 'peak' | 'valley' | 'normal';
}

export class CreatorAnalytics {
  
  /**
   * Analyze platform performance and diversification
   */
  static async analyzePlatformMetrics(userId: string, days = 90): Promise<PlatformMetrics[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const transactions = await db.transaction.findMany({
        where: {
          userId,
          amountCents: { lt: 0 }, // Income transactions
          createdAt: { gte: cutoffDate }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Group by platform
      const platformGroups = new Map<string, any[]>();
      
      transactions.forEach(transaction => {
        const platform = this.identifyPlatform(transaction.description, transaction.merchantName);
        if (platform) {
          if (!platformGroups.has(platform)) {
            platformGroups.set(platform, []);
          }
          platformGroups.get(platform)!.push(transaction);
        }
      });

      const metrics: PlatformMetrics[] = [];

      for (const [platform, platformTransactions] of platformGroups) {
        const totalRevenue = platformTransactions.reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / 100;
        const monthsSpan = Math.max(1, days / 30);
        const averageMonthly = totalRevenue / monthsSpan;
        
        // Calculate growth rate (first half vs second half)
        const midpoint = Math.floor(platformTransactions.length / 2);
        const firstHalf = platformTransactions.slice(0, midpoint);
        const secondHalf = platformTransactions.slice(midpoint);
        
        const firstHalfAvg = firstHalf.length > 0 ? 
          firstHalf.reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / firstHalf.length : 0;
        const secondHalfAvg = secondHalf.length > 0 ?
          secondHalf.reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / secondHalf.length : 0;
        
        const growthRate = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

        // Assess reliability based on payment frequency
        const daysBetweenPayments = this.calculateAveragePaymentInterval(platformTransactions);
        let reliability: 'high' | 'medium' | 'low' = 'medium';
        
        if (daysBetweenPayments < 15) reliability = 'high';
        else if (daysBetweenPayments > 45) reliability = 'low';

        metrics.push({
          platform,
          totalRevenue,
          averageMonthly,
          transactionCount: platformTransactions.length,
          lastPayment: platformTransactions.length > 0 ? platformTransactions[0].createdAt : null,
          growthRate,
          reliability
        });
      }

      return metrics.sort((a, b) => b.totalRevenue - a.totalRevenue);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to analyze platform metrics');
      return [];
    }
  }

  /**
   * Calculate equipment depreciation for tax purposes
   */
  static async calculateEquipmentDepreciation(userId: string): Promise<EquipmentDepreciation[]> {
    try {
      const equipmentTransactions = await db.transaction.findMany({
        where: {
          userId,
          amountCents: { gt: 0 }, // Expense transactions
          OR: [
            { category: { contains: 'equipment' } },
            { category: { contains: 'business' } },
            { description: { contains: 'camera' } },
            { description: { contains: 'microphone' } },
            { description: { contains: 'lighting' } },
            { description: { contains: 'computer' } }
          ]
        }
      });

      const depreciations: EquipmentDepreciation[] = [];

      for (const transaction of equipmentTransactions) {
        const metadata = this.parseTransactionMetadata(transaction.metadata);
        const category = metadata.category || this.identifyEquipmentCategory(transaction.description);
        
        if (!category) continue;

        const originalCost = transaction.amountCents / 100;
        const businessUse = metadata.businessUse || this.estimateBusinessUse(category);
        const depreciationPeriod = metadata.depreciationPeriod || this.getDepreciationPeriod(category);
        
        // Calculate depreciation
        const monthsOwned = this.getMonthsOwned(transaction.createdAt);
        const monthlyDepreciation = (originalCost * businessUse / 100) / depreciationPeriod;
        const totalDepreciated = Math.min(monthlyDepreciation * monthsOwned, originalCost * businessUse / 100);
        const currentValue = originalCost - totalDepreciated;
        const remainingValue = Math.max(0, (originalCost * businessUse / 100) - totalDepreciated);

        depreciations.push({
          id: transaction.id,
          item: transaction.description,
          originalCost,
          currentValue,
          monthlyDepreciation,
          remainingValue,
          businessUse,
          taxDeductible: totalDepreciated
        });
      }

      return depreciations;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to calculate equipment depreciation');
      return [];
    }
  }

  /**
   * Identify seasonal patterns in creator income
   */
  static async analyzeSeasonalPatterns(userId: string, years = 2): Promise<SeasonalPattern[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - years);

      const transactions = await db.transaction.findMany({
        where: {
          userId,
          amountCents: { lt: 0 }, // Income transactions
          createdAt: { gte: cutoffDate }
        }
      });

      // Group by month
      const monthlyData = new Map<number, number[]>();
      
      transactions.forEach(transaction => {
        const month = transaction.createdAt.getMonth();
        if (!monthlyData.has(month)) {
          monthlyData.set(month, []);
        }
        monthlyData.get(month)!.push(Math.abs(transaction.amountCents) / 100);
      });

      const patterns: SeasonalPattern[] = [];
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      // Calculate overall average
      const allRevenue = Array.from(monthlyData.values()).flat();
      const overallAverage = allRevenue.reduce((sum, val) => sum + val, 0) / allRevenue.length;

      for (let month = 0; month < 12; month++) {
        const monthData = monthlyData.get(month) || [];
        const averageRevenue = monthData.length > 0 ? 
          monthData.reduce((sum, val) => sum + val, 0) / monthData.length : 0;
        
        const variance = monthData.length > 0 ?
          monthData.reduce((sum, val) => sum + Math.pow(val - averageRevenue, 2), 0) / monthData.length : 0;

        let trend: 'peak' | 'valley' | 'normal' = 'normal';
        if (averageRevenue > overallAverage * 1.2) trend = 'peak';
        else if (averageRevenue < overallAverage * 0.8) trend = 'valley';

        patterns.push({
          month,
          monthName: monthNames[month],
          averageRevenue,
          variance,
          trend
        });
      }

      return patterns;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to analyze seasonal patterns');
      return [];
    }
  }

  /**
   * Generate cash flow forecast based on historical patterns
   */
  static async generateCashFlowForecast(userId: string, months = 6): Promise<{
    forecasts: Array<{ month: string; predictedRevenue: number; confidence: number }>;
    totalPredicted: number;
    averageMonthly: number;
  }> {
    try {
      const patterns = await this.analyzeSeasonalPatterns(userId);
      const metrics = await this.analyzePlatformMetrics(userId);
      
      const totalCurrentMonthly = metrics.reduce((sum, m) => sum + m.averageMonthly, 0);
      const forecasts = [];
      
      for (let i = 0; i < months; i++) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + i);
        const month = futureDate.getMonth();
        
        const seasonalPattern = patterns.find(p => p.month === month);
        const seasonalMultiplier = seasonalPattern ? 
          (seasonalPattern.averageRevenue / (patterns.reduce((sum, p) => sum + p.averageRevenue, 0) / 12)) : 1;
        
        const predictedRevenue = totalCurrentMonthly * seasonalMultiplier;
        
        // Confidence based on data variance and pattern reliability
        const confidence = Math.max(0.3, Math.min(0.95, 1 - (seasonalPattern?.variance || 1000) / predictedRevenue));
        
        forecasts.push({
          month: futureDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
          predictedRevenue,
          confidence
        });
      }

      return {
        forecasts,
        totalPredicted: forecasts.reduce((sum, f) => sum + f.predictedRevenue, 0),
        averageMonthly: forecasts.reduce((sum, f) => sum + f.predictedRevenue, 0) / months
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate cash flow forecast');
      return { forecasts: [], totalPredicted: 0, averageMonthly: 0 };
    }
  }

  // Helper methods
  private static identifyPlatform(description: string, merchant?: string): string | null {
    const text = `${description} ${merchant || ''}`.toLowerCase();
    
    if (text.includes('youtube') || text.includes('google adsense')) return 'youtube';
    if (text.includes('twitch')) return 'twitch';
    if (text.includes('tiktok')) return 'tiktok';
    if (text.includes('instagram') || text.includes('meta')) return 'instagram';
    if (text.includes('patreon')) return 'patreon';
    if (text.includes('onlyfans')) return 'onlyfans';
    if (text.includes('substack')) return 'substack';
    if (text.includes('stripe') || text.includes('paypal')) return 'other';
    
    return null;
  }

  private static identifyEquipmentCategory(description: string): string | null {
    const text = description.toLowerCase();
    
    if (text.includes('camera') || text.includes('lens')) return 'camera';
    if (text.includes('microphone') || text.includes('audio')) return 'audio';
    if (text.includes('light') || text.includes('led')) return 'lighting';
    if (text.includes('computer') || text.includes('laptop')) return 'computer';
    if (text.includes('software') || text.includes('adobe')) return 'software';
    
    return null;
  }

  private static estimateBusinessUse(category: string): number {
    const businessUseMap: Record<string, number> = {
      camera: 85,
      audio: 90,
      lighting: 95,
      computer: 75,
      software: 95,
      storage: 80,
    };
    
    return businessUseMap[category] || 80;
  }

  private static getDepreciationPeriod(category: string): number {
    const depreciationPeriods: Record<string, number> = {
      camera: 60, // 5 years
      audio: 60,
      lighting: 36, // 3 years
      computer: 36,
      software: 12, // 1 year
      storage: 36,
    };
    
    return depreciationPeriods[category] || 36;
  }

  private static getMonthsOwned(purchaseDate: Date): number {
    const now = new Date();
    return Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
  }

  private static calculateAveragePaymentInterval(transactions: any[]): number {
    if (transactions.length < 2) return 30; // Default to monthly

    const sortedTransactions = transactions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let totalDays = 0;
    
    for (let i = 1; i < sortedTransactions.length; i++) {
      const daysDiff = (sortedTransactions[i].createdAt.getTime() - sortedTransactions[i-1].createdAt.getTime()) / (1000 * 60 * 60 * 24);
      totalDays += daysDiff;
    }
    
    return totalDays / (sortedTransactions.length - 1);
  }

  private static parseTransactionMetadata(metadata: string | null): any {
    try {
      return metadata ? JSON.parse(metadata) : {};
    } catch {
      return {};
    }
  }
}
